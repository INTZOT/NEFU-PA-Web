/**
 * 官方赛事与报名。
 *
 * 依据：
 *   - R-89 / D-03：活动模块**仅覆盖报名侧**，抽签、赛程、比分、名次全部线下
 *   - D-20：名额单位随赛制而定（单打按人、双打按队），候补按报名时间先到先得
 *   - D-28：候补递补**自动**；双打一人取消则**整队释放**；未到场记 absent；
 *           报名截止可配置，默认赛前 24 小时
 *
 * 本模块是整个活动功能里最容易出错的部分（名额计数、递补、并发），
 * 因此把规则集中在这里，页面与接口只负责调用。
 */

import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "@/lib/db";
import { record as notify } from "@/modules/notification/service";

export type EventFormat = "singles" | "doubles";
export type EventStatus = "draft" | "open" | "closed" | "finished";
export type RegistrationStatus = "registered" | "waitlisted" | "cancelled" | "absent";

export interface Event {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string | null;
  location: string | null;
  format: EventFormat;
  capacity: number;
  capacityUnit: "people" | "teams";
  registrationDeadline: string | null;
  status: EventStatus;
}

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  format: EventFormat;
  capacity: number;
  capacity_unit: "people" | "teams";
  registration_deadline: string | null;
  status: EventStatus;
}

function toEvent(r: EventRow): Event {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    startAt: r.start_at,
    endAt: r.end_at,
    location: r.location,
    format: r.format,
    capacity: r.capacity,
    capacityUnit: r.capacity_unit,
    registrationDeadline: r.registration_deadline,
    status: r.status,
  };
}

const EVENT_COLUMNS = `
  id, title, description, start_at, end_at, location,
  format, capacity, capacity_unit, registration_deadline, status
`;

// ---------------------------------------------------------------------------
// 名额计算
// ---------------------------------------------------------------------------

/**
 * 名额占用数。
 *
 * 单打：一个正式报名 = 占 1 个名额。
 * 双打：名额单位是**队**，因此已确认的搭档两人合占 1 个名额，
 *       单人报名（尚未配对）先各自占 1 个，待管理员配对或双方确认后合并。
 *
 * 这个口径与 D-20「名额按队算」一致：一支完整的队始终只占 1 个名额。
 */
export async function countOccupied(eventId: string): Promise<number> {
  const row = await queryOne<{ occupied: string }>(
    `WITH confirmed AS (
       -- 已确认的搭档关系：两人合并为一个名额，取其中一人代表
       SELECT p.user_a_id AS user_id
         FROM pairings p
        WHERE p.event_id = $1 AND p.status = 'confirmed'
     )
     SELECT count(*)::text AS occupied
       FROM event_registrations r
      WHERE r.event_id = $1
        AND r.status = 'registered'
        AND (r.user_id IN (SELECT user_id FROM confirmed)
             OR r.user_id NOT IN (
               SELECT user_a_id FROM pairings WHERE event_id = $1 AND status = 'confirmed'
               UNION
               SELECT user_b_id FROM pairings WHERE event_id = $1 AND status = 'confirmed'
             ))`,
    [eventId],
  );
  return Number(row?.occupied ?? 0);
}

export interface EventSummary extends Event {
  occupied: number;
  remaining: number;
  waitlistCount: number;
  registeredCount: number;
}

async function summarize(event: Event): Promise<EventSummary> {
  const [occupied, counts] = await Promise.all([
    countOccupied(event.id),
    queryOne<{ waitlisted: string; registered: string }>(
      `SELECT
         count(*) FILTER (WHERE status = 'waitlisted')::text AS waitlisted,
         count(*) FILTER (WHERE status IN ('registered','absent'))::text AS registered
       FROM event_registrations WHERE event_id = $1`,
      [event.id],
    ),
  ]);
  return {
    ...event,
    occupied,
    remaining: Math.max(0, event.capacity - occupied),
    waitlistCount: Number(counts?.waitlisted ?? 0),
    registeredCount: Number(counts?.registered ?? 0),
  };
}

/** 公开的赛事列表：非草稿，按开始时间。 */
export async function listPublished(): Promise<EventSummary[]> {
  const rows = await query<EventRow>(
    `SELECT ${EVENT_COLUMNS} FROM events
      WHERE status <> 'draft'
      ORDER BY start_at`,
  );
  return Promise.all(rows.map((r) => summarize(toEvent(r))));
}

/** 后台列表：包含草稿。 */
export async function listAll(): Promise<EventSummary[]> {
  const rows = await query<EventRow>(
    `SELECT ${EVENT_COLUMNS} FROM events ORDER BY start_at DESC`,
  );
  return Promise.all(rows.map((r) => summarize(toEvent(r))));
}

export async function getById(id: string): Promise<EventSummary | null> {
  const row = await queryOne<EventRow>(
    `SELECT ${EVENT_COLUMNS} FROM events WHERE id = $1`,
    [id],
  );
  return row ? summarize(toEvent(row)) : null;
}

// ---------------------------------------------------------------------------
// 发布
// ---------------------------------------------------------------------------

export interface EventInput {
  title: string;
  description: string | null;
  startAt: Date;
  location: string | null;
  format: EventFormat;
  capacity: number;
  registrationDeadline: Date | null;
  status: "draft" | "open";
}

export type ParseEventResult =
  | { ok: true; value: EventInput }
  | { ok: false; error: string };

/** 表单是 datetime-local，形如 2026-11-01T14:00。 */
function parseLocalDateTime(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseEventInput(form: {
  title: string;
  description: string;
  startAt: string;
  location: string;
  format: string;
  capacity: string;
  registrationDeadline: string;
  status: string;
}): ParseEventResult {
  const title = form.title.trim();
  if (!title) return { ok: false, error: "标题不能为空" };
  if (title.length > 100) return { ok: false, error: "标题过长（最多 100 字）" };

  if (form.format !== "singles" && form.format !== "doubles") {
    return { ok: false, error: "赛制不合法" };
  }

  const capacity = Number(form.capacity);
  if (!Number.isInteger(capacity) || capacity <= 0) {
    return { ok: false, error: "名额上限必须是正整数" };
  }

  const startAt = parseLocalDateTime(form.startAt);
  if (!startAt) return { ok: false, error: "开始时间格式不正确" };

  let registrationDeadline = parseLocalDateTime(form.registrationDeadline);
  if (!registrationDeadline) {
    // D-28 第四条：默认赛前 24 小时
    registrationDeadline = new Date(startAt.getTime() - CANCEL_HOURS_BEFORE * 3600_000);
  }
  if (registrationDeadline >= startAt) {
    return { ok: false, error: "报名截止必须早于开始时间" };
  }

  const status = form.status === "open" ? "open" : "draft";

  return {
    ok: true,
    value: {
      title,
      description: form.description.trim() || null,
      startAt,
      location: form.location.trim() || null,
      format: form.format,
      capacity,
      registrationDeadline,
      status,
    },
  };
}

export async function createEvent(input: EventInput, createdBy: string): Promise<string> {
  // 名额单位由赛制决定（D-20），不接受表单传入，避免出现「双打按人」这种矛盾组合
  const capacityUnit = input.format === "doubles" ? "teams" : "people";

  const row = await queryOne<{ id: string }>(
    `INSERT INTO events
       (title, description, start_at, location, format, capacity, capacity_unit,
        registration_deadline, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      input.title,
      input.description,
      input.startAt,
      input.location,
      input.format,
      input.capacity,
      capacityUnit,
      input.registrationDeadline,
      input.status,
      createdBy,
    ],
  );
  if (!row) throw new Error("创建活动失败");
  return row.id;
}

// ---------------------------------------------------------------------------
// 时间规则
// ---------------------------------------------------------------------------

export const CANCEL_HOURS_BEFORE = 24;

/**
 * 候补优先级排序（D-28 第三条）。
 *
 * 先按**缺席次数**升序（没缺席过的排前面），再按报名时间 —— 即：
 * 名额紧张时，常缺席的人让位给更可能到场的人。
 * 这是项目里唯一的成员信誉机制：积分不惩罚爽约（D-04）。
 *
 * 注意 ORDER BY 里的子查询引用了外层表的别名，因此各调用处的表别名必须叫这个。
 */
const WAITLIST_ORDER_SQL = `
  ORDER BY
    (SELECT count(*) FROM event_registrations a
      WHERE a.user_id = w.user_id AND a.status = 'absent'),
    w.registered_at`;

export function nowMs(): number {
  return Date.now();
}

/** 报名是否仍开放（D-28 第四条）。 */
export function isRegistrationOpen(event: Event, at: number = nowMs()): boolean {
  if (event.status !== "open") return false;
  if (event.registrationDeadline && new Date(event.registrationDeadline).getTime() <= at) {
    return false;
  }
  return true;
}

/** 是否还能取消（D-20：赛前 24 小时）。 */
export function canCancel(event: Event, at: number = nowMs()): boolean {
  const deadline = new Date(event.startAt).getTime() - CANCEL_HOURS_BEFORE * 3600_000;
  return at < deadline;
}

// ---------------------------------------------------------------------------
// 报名 / 取消 / 递补
// ---------------------------------------------------------------------------

export type RegisterResult =
  | { ok: true; status: RegistrationStatus }
  | { ok: false; error: string };

/**
 * 报名（单打路径）。
 *
 * 名额满则进入候补（D-20 的候补机制）。
 * 并发安全：整个「计数 + 插入」放在一个事务里，并对赛事行加锁，
 *          否则两人同时报名可能都读到「还剩 1 个」。
 */
export async function register(userId: string, eventId: string): Promise<RegisterResult> {
  return withTransaction(async (client) => {
    // 锁住赛事行，串行化同一赛事的报名
    const eventRow = await client.query<EventRow>(
      `SELECT ${EVENT_COLUMNS} FROM events WHERE id = $1 FOR UPDATE`,
      [eventId],
    );
    const row = eventRow.rows[0];
    if (!row) return { ok: false, error: "赛事不存在" };
    const event = toEvent(row);

    if (!isRegistrationOpen(event)) {
      return { ok: false, error: "报名已截止" };
    }

    const existing = await client.query<{ status: RegistrationStatus }>(
      "SELECT status FROM event_registrations WHERE event_id = $1 AND user_id = $2",
      [eventId, userId],
    );
    const current = existing.rows[0];
    if (current && current.status !== "cancelled") {
      return { ok: false, error: "你已经报名了" };
    }

    const occupied = await countOccupiedLocked(client, eventId);
    const status: RegistrationStatus =
      occupied < event.capacity ? "registered" : "waitlisted";

    if (current) {
      // 取消过再报：复用原行，重新排到队尾
      await client.query(
        `UPDATE event_registrations
            SET status = $3, registered_at = now(), cancelled_at = NULL
          WHERE event_id = $1 AND user_id = $2`,
        [eventId, userId, status],
      );
    } else {
      await client.query(
        `INSERT INTO event_registrations (event_id, user_id, status)
         VALUES ($1, $2, $3)`,
        [eventId, userId, status],
      );
    }

    return { ok: true, status };
  });
}

export type CancelResult =
  | { ok: true; promoted: string | null }
  | { ok: false; error: string };

/**
 * 取消报名。
 *
 * D-28 第二条：双打中**任一成员取消 → 整队释放**，队友也失去名额。
 * D-28 第一条：释放出的名额**自动**给最早的候补。
 *
 * 返回 promoted 为被自动递补者的 user_id（无则为 null）。
 */
export async function cancel(userId: string, eventId: string): Promise<CancelResult> {
  const result = await withTransaction(async (client) => {
    return cancelTx(client, userId, eventId);
  });

  if (!result.ok) return result;

  // 通知在事务之后发。
  const title = result.eventTitle;
  const link = "/events/" + eventId;

  // ① 候补被自动递补 —— 这条最要紧：不通知他就不知道自己已经拿到名额了。
  if (result.promoted) {
    await notify({
      userId: result.promoted,
      kind: "event.promoted",
      title: "你已从候补转为正式报名",
      body: "活动：" + title,
      link,
      dedupeKey: null,
    });
  }

  // ② 搭档因你取消而一起失去名额（D-28：整队释放）
  for (const pid of result.alsoReleased) {
    await notify({
      userId: pid,
      kind: "event.released",
      title: "你的报名已被释放",
      body: "活动：" + title + "\n搭档取消了报名，按规则整队释放名额。",
      link,
      dedupeKey: null,
    });
  }

  return { ok: true, promoted: result.promoted };
}

/** 取消报名的事务部分：多返回发通知所需的信息。 */
async function cancelTx(
  client: PoolClient,
  userId: string,
  eventId: string,
): Promise<
  | {
      ok: true;
      promoted: string | null;
      eventTitle: string;
      alsoReleased: string[];
    }
  | { ok: false; error: string }
> {
    const eventRow = await client.query<EventRow>(
      `SELECT ${EVENT_COLUMNS} FROM events WHERE id = $1 FOR UPDATE`,
      [eventId],
    );
    const row = eventRow.rows[0];
    if (!row) return { ok: false, error: "赛事不存在" };
    const event = toEvent(row);

    if (!canCancel(event)) {
      return { ok: false, error: `已过取消截止时间（赛前 ${CANCEL_HOURS_BEFORE} 小时）` };
    }

    const mine = await client.query<{ status: RegistrationStatus }>(
      "SELECT status FROM event_registrations WHERE event_id = $1 AND user_id = $2",
      [eventId, userId],
    );
    const current = mine.rows[0];
    if (!current || current.status === "cancelled") {
      return { ok: false, error: "你没有报名这个赛事" };
    }

    // 找出搭档（若已确认）：整队一起释放
    const partner = await client.query<{ partner_id: string }>(
      `SELECT CASE WHEN user_a_id = $2 THEN user_b_id ELSE user_a_id END AS partner_id
         FROM pairings
        WHERE event_id = $1 AND status = 'confirmed'
          AND (user_a_id = $2 OR user_b_id = $2)`,
      [eventId, userId],
    );

    const toCancel = [userId, ...partner.rows.map((r) => r.partner_id)];
    await client.query(
      `UPDATE event_registrations
          SET status = 'cancelled', cancelled_at = now()
        WHERE event_id = $1 AND user_id = ANY($2::uuid[])
          AND status IN ('registered','waitlisted')`,
      [eventId, toCancel],
    );

    // 整队释放：解除搭档关系
    if (partner.rows.length > 0) {
      await client.query(
        `UPDATE pairings SET status = 'cancelled'
          WHERE event_id = $1 AND status = 'confirmed'
            AND (user_a_id = ANY($2::uuid[]) OR user_b_id = ANY($2::uuid[]))`,
        [eventId, toCancel],
      );
    }

    // 自动递补：按报名时间取最早的候补
    const waitlisted = await client.query<{ user_id: string }>(
      `SELECT w.user_id FROM event_registrations w
        WHERE w.event_id = $1 AND w.status = 'waitlisted'
        ${WAITLIST_ORDER_SQL}
        LIMIT 1`,
      [eventId],
    );

    let promoted: string | null = null;
    if (waitlisted.rows[0]) {
      promoted = waitlisted.rows[0].user_id;
      await client.query(
        `UPDATE event_registrations
            SET status = 'registered', promoted_at = now()
          WHERE event_id = $1 AND user_id = $2`,
        [eventId, promoted],
      );
    }

    return {
      ok: true,
      promoted,
      eventTitle: event.title,
      alsoReleased: partner.rows.map((r: { partner_id: string }) => r.partner_id),
    };
}

/** countOccupied 的事务内版本（复用同一 client）。 */
async function countOccupiedLocked(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: { occupied: string }[] }> },
  eventId: string,
): Promise<number> {
  const res = await client.query(
    `WITH confirmed AS (
       SELECT p.user_a_id AS user_id
         FROM pairings p
        WHERE p.event_id = $1 AND p.status = 'confirmed'
     )
     SELECT count(*)::text AS occupied
       FROM event_registrations r
      WHERE r.event_id = $1
        AND r.status = 'registered'
        AND (r.user_id IN (SELECT user_id FROM confirmed)
             OR r.user_id NOT IN (
               SELECT user_a_id FROM pairings WHERE event_id = $1 AND status = 'confirmed'
               UNION
               SELECT user_b_id FROM pairings WHERE event_id = $1 AND status = 'confirmed'
             ))`,
    [eventId],
  );
  return Number(res.rows[0]?.occupied ?? 0);
}


// ---------------------------------------------------------------------------
// 我的报名（个人主页用）
// ---------------------------------------------------------------------------

export type MyRegistrationStatus = "registered" | "waitlisted" | "attended" | "absent";

export interface MyRegistration {
  eventId: string;
  eventTitle: string;
  startAt: string;
  location: string | null;
  format: EventFormat;
  status: MyRegistrationStatus;
  /** 候补中的排位（从 1 起）。仅 status 为 waitlisted 时有值。 */
  waitlistPosition: number | null;
}

/**
 * 候补排位。
 *
 * 规则与活动页的候选队列一致：**先按缺席次数少的优先，再按报名时间**（D-28）。
 * 用窗口函数一次算出，避免把排序规则抄成两份（抄两份迟早漂移）。
 */
async function waitlistPositionOf(eventId: string, userId: string): Promise<number | null> {
  const row = await queryOne<{ pos: string }>(
    `SELECT pos FROM (
         SELECT r.user_id,
                row_number() OVER (
                  ORDER BY (SELECT count(*) FROM event_registrations x
                             WHERE x.user_id = r.user_id AND x.status = 'absent'),
                           r.registered_at
                ) AS pos
           FROM event_registrations r
          WHERE r.event_id = $1 AND r.status = 'waitlisted'
       ) t WHERE t.user_id = $2`,
    [eventId, userId],
  );
  return row ? Number(row.pos) : null;
}

/**
 * 我报名的活动（含候补）。
 *
 * 「已参加」只能靠签到记录判断。活动**尚未结束**时不能判为缺席 ——
 * 那时还没到签到的时候，因此未结束的一律显示「已报名」。
 */
export async function listMine(userId: string): Promise<MyRegistration[]> {
  const rows = await query<{
    event_id: string;
    title: string;
    start_at: string;
    end_at: string | null;
    location: string | null;
    format: EventFormat;
    status: string;
    checked_in_at: string | null;
  }>(
    `SELECT r.event_id, e.title, e.start_at, e.end_at, e.location, e.format,
            r.status, r.checked_in_at
       FROM event_registrations r
       JOIN events e ON e.id = r.event_id
      WHERE r.user_id = $1 AND r.status <> 'cancelled'
      ORDER BY e.start_at DESC`,
    [userId],
  );

  const now = Date.now();

  return Promise.all(
    rows.map(async (r) => {
      let status: MyRegistrationStatus;
      if (r.status === "waitlisted") {
        status = "waitlisted";
      } else if (r.checked_in_at) {
        status = "attended";
      } else {
        const ended = new Date(r.end_at ?? r.start_at).getTime() < now;
        status = ended ? "absent" : "registered";
      }

      return {
        eventId: r.event_id,
        eventTitle: r.title,
        startAt: r.start_at,
        location: r.location,
        format: r.format,
        status,
        waitlistPosition:
          status === "waitlisted" ? await waitlistPositionOf(r.event_id, userId) : null,
      };
    }),
  );
}
