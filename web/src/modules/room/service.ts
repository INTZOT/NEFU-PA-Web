/**
 * 约球大厅：房间、申请、审批。
 *
 * 依据 D-10 与 D-29：
 *   - 任何成员可发起；填时间段 / 人数上限 / 备注（不设场地与赛制字段，写备注里，R-55）
 *   - 其他成员申请加入，**发起人审批**（可拒绝）
 *   - 满员后房间**锁死**，不再接受申请
 *   - 有成员中途退出 → **恢复空位**，房间重新可申请
 *   - **24 小时自动过期**；未处理的申请随房间一起过期
 *   - 发起人可主动取消；取消与过期都**无信誉影响**（D-29）
 *   - 不校验积分（D-04）
 *
 * 房间状态机（D-29 附图）是本模块最需要仔细处理的部分：
 *   open ⇄ full 是**双向**转换，cancelled / expired 是终态。
 *
 * 过期采用**惰性判定**：每次读取时把已到期的房间标记为 expired。
 * 这样做不需要定时任务（项目是单人维护，不引入额外组件），代价是
 * 「过期」这一状态只在有人访问时才变为可见 —— 对本场景完全够用。
 */

import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "@/lib/db";
import { record as notify } from "@/modules/notification/service";

/**
 * 活动结束后多久房间过期。
 *
 * 代 24 小时的「发布后固定过期」—— 那样想组织「下周六打球」就非得等到周五才能发，
 * 否则帖子第二天就消失了（详见 D-44）。
 */
const EXPIRE_AFTER_END_HOURS = 2;

/** 没填结束时间时的兜底：按开始后 4 小时算（够一场球打完）。 */
const EXPIRE_AFTER_START_HOURS = 4;

/**
 * 把「datetime-local」输入（如 `2026-10-13T15:00`）解析成 Date。
 *
 * ⚠️ 不加 'Z'，让它按**服务器本地时区**解析 —— 服务器时区是 Asia/Shanghai，
 * 与成员所在时区一致。若解析成 UTC 会导致所有时间偏移 8 小时。
 */
function parseLocalDateTime(value: string): Date | null {
  const t = value.trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type RoomStatus = "open" | "full" | "cancelled" | "expired";
export type ApplicationStatus = "pending" | "approved" | "rejected" | "withdrawn" | "expired";

export interface Room {
  id: string;
  initiatorId: string;
  initiatorName: string;
  /** 开始时间（ISO 字符串）。 */
  startAt: string;
  /** 结束时间（ISO 字符串），未填则为 null。 */
  endAt: string | null;
  capacity: number;
  note: string | null;
  status: RoomStatus;
  createdAt: string;
  expiresAt: string;
  /** 已同意的**申请人**数量（不含发起人）。 */
  memberCount: number;
  pendingCount: number;
  /**
   * 还差几人满员（已计入发起人）。
   *
   * 单独给出这个字段，是因为「成员数是否含发起人」极易搞错 ——
   * 页面各处自己 +1 迟早会有一处漏掉。0 表示已满。
   */
  seatsLeft: number;
}

interface RoomRow {
  id: string;
  initiator_id: string;
  initiator_name: string;
  start_at: string;
  end_at: string | null;
  capacity: number;
  note: string | null;
  status: RoomStatus;
  created_at: string;
  expires_at: string;
  member_count: string;
  pending_count: string;
}

function toRoom(r: RoomRow): Room {
  return {
    id: r.id,
    initiatorId: r.initiator_id,
    initiatorName: r.initiator_name,
    startAt: r.start_at,
    endAt: r.end_at,
    capacity: r.capacity,
    note: r.note,
    status: r.status,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    memberCount: Number(r.member_count),
    pendingCount: Number(r.pending_count),
    // 发起人本人占一个位置
    seatsLeft: Math.max(0, r.capacity - Number(r.member_count) - 1),
  };
}

/**
 * 惰性过期：把已到期的房间及其未处理申请标记掉。
 *
 * 每次读取房间前调用。已取消/已过期的房间不再处理。
 */
export async function expireDue(): Promise<void> {
  await withTransaction(async (client) => {
    const expired = await client.query<{ id: string }>(
      `UPDATE match_rooms SET status = 'expired'
        WHERE expires_at <= now() AND status IN ('open','full')
        RETURNING id`,
    );
    if (expired.rows.length === 0) return;

    const ids = expired.rows.map((r) => r.id);
    await client.query(
      `UPDATE room_applications SET status = 'expired', decided_at = now()
        WHERE room_id = ANY($1::uuid[]) AND status = 'pending'`,
      [ids],
    );
  });
}

const ROOM_SELECT = `
  SELECT r.id, r.initiator_id, i.name AS initiator_name, r.start_at, r.end_at,
         r.capacity, r.note, r.status, r.created_at, r.expires_at,
         (SELECT count(*)::text FROM room_applications a
           WHERE a.room_id = r.id AND a.status = 'approved') AS member_count,
         (SELECT count(*)::text FROM room_applications a
           WHERE a.room_id = r.id AND a.status = 'pending') AS pending_count
    FROM match_rooms r
    JOIN users i ON i.id = r.initiator_id
`;

/** 大厅列表：招募中与已满的（已取消/已过期的不展示）。 */
export async function listActive(): Promise<Room[]> {
  await expireDue();
  // 按「活动开始时间」升序：最近要打的排最前，这才是成员关心的顺序。
  // （原来按创建时间倒序，会让早先发布但时间更晚的排前面。）
  const rows = await query<RoomRow>(
    `${ROOM_SELECT} WHERE r.status IN ('open','full') ORDER BY r.start_at ASC`,
  );
  return rows.map(toRoom);
}

export async function getById(id: string): Promise<Room | null> {
  await expireDue();
  const row = await queryOne<RoomRow>(`${ROOM_SELECT} WHERE r.id = $1`, [id]);
  return row ? toRoom(row) : null;
}

/** 我发起的房间（含已取消/已过期，便于回看）与我加入的房间。 */
export async function listMine(userId: string): Promise<{
  initiated: Room[];
  joined: Room[];
}> {
  await expireDue();
  const [initiated, joined] = await Promise.all([
    query<RoomRow>(
      `${ROOM_SELECT} WHERE r.initiator_id = $1 ORDER BY r.created_at DESC`,
      [userId],
    ),
    query<RoomRow>(
      `${ROOM_SELECT}
        JOIN room_applications a ON a.room_id = r.id
       WHERE a.applicant_id = $1 AND a.status = 'approved'
       ORDER BY r.created_at DESC`,
      [userId],
    ),
  ]);
  return { initiated: initiated.map(toRoom), joined: joined.map(toRoom) };
}

/**
 * 把时间范围渲染成给成员看的文案。
 *
 * 例：`今天 15:00-17:00`、`明天 20:30 开始`、`10月18日 周六 14:00-16:00`。
 *
 * 相对日期（今天/明天）比「10月13日」更好用 —— 成员关心的是「还有多久」。
 */
export function formatRoomTime(startAt: string, endAt: string | null): string {
  const start = new Date(startAt);
  const end = endAt ? new Date(endAt) : null;

  const pad = (n: number) => String(n).padStart(2, "0");
  const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  // 按「本地日历天」求差，不能用毫秒差 —— 否则今晚 23:00 到明早 01:00 会被算成同一天。
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((dayStart(start) - dayStart(new Date())) / 86400000);

  let prefix: string;
  if (dayDiff === 0) prefix = "今天";
  else if (dayDiff === 1) prefix = "明天";
  else if (dayDiff === -1) prefix = "昨天";
  else if (dayDiff > 1 && dayDiff < 7) {
    prefix = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][start.getDay()];
  } else {
    prefix = `${start.getMonth() + 1}月${start.getDate()}日`;
  }

  return end
    ? `${prefix} ${hhmm(start)}-${hhmm(end)}`
    : `${prefix} ${hhmm(start)} 开始`;
}

// ---------------------------------------------------------------------------
// 状态机
// ---------------------------------------------------------------------------

/**
 * 按当前成员数修正房间状态（open ⇄ full）。
 *
 * 这是「满员锁死」与「退出恢复空位」的实现点。
 * 只在房间处于 open/full 时生效 —— 终态（cancelled/expired）不被覆盖。
 */
async function syncRoomStatus(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, string>[] }> },
  roomId: string,
): Promise<void> {
  // 注意：**发起人本人占一个名额**，所以是「已通过的申请数 + 1」与上限比较。
  // 这里曾漏算发起人，导致 capacity=2 且有 1 人通过时房间没有被锁死。
  await client.query(
    `UPDATE match_rooms r
        SET status = CASE
              WHEN (SELECT count(*) FROM room_applications a
                     WHERE a.room_id = r.id AND a.status = 'approved') + 1 >= r.capacity
              THEN 'full' ELSE 'open' END
      WHERE r.id = $1 AND r.status IN ('open','full')`,
    [roomId],
  );
}

// ---------------------------------------------------------------------------
// 发起
// ---------------------------------------------------------------------------

export interface RoomInput {
  startAt: Date;
  endAt: Date | null;
  capacity: number;
  note: string | null;
}

export type ParseRoomResult =
  | { ok: true; value: RoomInput }
  | { ok: false; error: string };

export function parseRoomInput(form: {
  startAt: string;
  endAt: string;
  capacity: string;
  note: string;
}): ParseRoomResult {
  const startAt = parseLocalDateTime(form.startAt);
  if (!startAt) return { ok: false, error: "请填写活动开始时间" };

  // 结束时间是选填的：大多数约球说不准打到几点。
  // 但**填了就必须晚于开始**，否则是明显的输入错误。
  const endRaw = form.endAt.trim();
  let endAt: Date | null = null;
  if (endRaw) {
    endAt = parseLocalDateTime(endRaw);
    if (!endAt) return { ok: false, error: "结束时间格式不正确" };
    if (endAt.getTime() <= startAt.getTime()) {
      return { ok: false, error: "结束时间必须晚于开始时间" };
    }
  }

  // 已经过去的活动没必要发布 —— 发出来立刻就是过期状态，只会让人困惑。
  // 给 5 分钟宽限，避免「差一分钟」被拒。
  if (startAt.getTime() < Date.now() - 5 * 60 * 1000) {
    return { ok: false, error: "开始时间不能是过去的时间" };
  }

  const capacity = Number(form.capacity);
  if (!Number.isInteger(capacity) || capacity < 2) {
    return { ok: false, error: "人数上限至少为 2" };
  }
  if (capacity > 20) return { ok: false, error: "人数上限过大（最多 20）" };

  const note = form.note.trim();
  if (note.length > 200) return { ok: false, error: "备注过长（最多 200 字）" };

  return { ok: true, value: { startAt, endAt, capacity, note: note || null } };
}

export async function createRoom(input: RoomInput, initiatorId: string): Promise<string> {
  // 过期时间 = 活动结束后 2 小时（没填结束时间则按开始后 4 小时）。
  // 这意味着「时间已过的活动」会自然下架，不需要额外清理。
  const row = await queryOne<{ id: string }>(
    `INSERT INTO match_rooms (initiator_id, start_at, end_at, capacity, note, expires_at)
     VALUES ($1, $2, $3, $4, $5,
             COALESCE($3::timestamptz + ($6 || ' hours')::interval,
                      $2::timestamptz + ($7 || ' hours')::interval))
     RETURNING id`,
    [
      initiatorId,
      input.startAt.toISOString(),
      input.endAt ? input.endAt.toISOString() : null,
      input.capacity,
      input.note,
      String(EXPIRE_AFTER_END_HOURS),
      String(EXPIRE_AFTER_START_HOURS),
    ],
  );
  if (!row) throw new Error("创建约球房间失败");
  return row.id;
}

// ---------------------------------------------------------------------------
// 申请 / 审批 / 退出
// ---------------------------------------------------------------------------

export type ActionResult =
  | { ok: true; roomId?: string }
  | { ok: false; error: string };

/** 申请加入。满员时拒绝（房间此时已被锁死）。 */
export async function apply(roomId: string, userId: string): Promise<ActionResult> {
  const result = await withTransaction(async (client) => {
    return applyTx(client, roomId, userId);
  });

  if (!result.ok) return result;

  // 通知在事务**之后**发（见 notifyRoom 的说明）
  const [slot, who] = await Promise.all([roomSlot(roomId), userName(userId)]);
  await notifyRoom({
    roomId,
    to: result.initiatorId,
    kind: "room.applied",
    title: `${who} 申请加入你的约球`,
    body: `时间：${slot}`,
    // 同一个约球被多人连着申请时合并成一条，避免刷屏
    dedupeKey: `room.applied:${roomId}`,
  });

  return { ok: true };
}

/** 申请的事务部分：可复用的内部实现，返回发起人 id 供事务后发通知。 */
async function applyTx(
  client: PoolClient,
  roomId: string,
  userId: string,
): Promise<{ ok: true; initiatorId: string } | { ok: false; error: string }> {
  // 锁房间行：申请要读成员数，必须与审批/退出串行
  const room = await client.query<{ status: RoomStatus; initiator_id: string; capacity: number }>(
    "SELECT status, initiator_id, capacity FROM match_rooms WHERE id = $1 FOR UPDATE",
    [roomId],
  );
    const r = room.rows[0];
    if (!r) return { ok: false, error: "房间不存在" };
    if (r.status === "cancelled") return { ok: false, error: "房间已被发起人取消" };
    if (r.status === "expired") return { ok: false, error: "房间已过期" };
    if (r.initiator_id === userId) return { ok: false, error: "你是发起人，无需申请" };

    // +1 为发起人本人（见 syncRoomStatus 的说明）
    const memberCount = await countApproved(client, roomId);
    if (memberCount + 1 >= r.capacity) {
      return { ok: false, error: "房间已满" };
    }

    const existing = await client.query<{ status: ApplicationStatus }>(
      "SELECT status FROM room_applications WHERE room_id = $1 AND applicant_id = $2",
      [roomId, userId],
    );
    const cur = existing.rows[0]?.status;
    if (cur === "pending") return { ok: false, error: "你已经申请过了，等待发起人处理" };
    if (cur === "approved") return { ok: false, error: "你已经在房间里了" };

    if (cur) {
      await client.query(
        `UPDATE room_applications
            SET status = 'pending', applied_at = now(), decided_at = NULL
          WHERE room_id = $1 AND applicant_id = $2`,
        [roomId, userId],
      );
    } else {
      await client.query(
        "INSERT INTO room_applications (room_id, applicant_id) VALUES ($1, $2)",
        [roomId, userId],
      );
    }
    // 带上发起人 id：事务提交后要给他发通知
    return { ok: true, initiatorId: r.initiator_id };
}

/** 审批（仅发起人）。同意后若满员则锁死房间。 */
export async function decide(
  applicationId: string,
  actorId: string,
  approve: boolean,
): Promise<ActionResult> {
  const result = await withTransaction(async (client) => {
    return decideTx(client, applicationId, actorId, approve);
  });

  if (!result.ok) return result;

  // 通知在事务之后发。
  // ⚠️ 这条比「有人申请」更重要：申请人不知道结果就会一直等。
  const [slot, who] = await Promise.all([
    roomSlot(result.roomId),
    userName(result.actorId),
  ]);
  await notifyRoom({
    roomId: result.roomId,
    to: result.applicantId,
    kind: "room.decided",
    title: approve ? "你的约球申请已通过" : "你的约球申请未通过",
    body: approve
      ? "时间：" + slot
      : "时间：" + slot + "\n发起人：" + who,
    // 同一申请只会被处理一次（事务里已校验 status='pending'），不需要去重
    dedupeKey: null,
  });

  return { ok: true };
}

/** 审批的事务部分：返回发通知所需的信息。 */
async function decideTx(
  client: PoolClient,
  applicationId: string,
  actorId: string,
  approve: boolean,
): Promise<{ ok: true; roomId: string; applicantId: string; actorId: string } | { ok: false; error: string }> {
  const app = await client.query<{ room_id: string; applicant_id: string; status: ApplicationStatus }>(
      "SELECT room_id, applicant_id, status FROM room_applications WHERE id = $1 FOR UPDATE",
      [applicationId],
    );
    const a = app.rows[0];
    if (!a) return { ok: false, error: "申请不存在" };
    if (a.status !== "pending") return { ok: false, error: "这个申请已经处理过了" };

    const room = await client.query<{ status: RoomStatus; initiator_id: string; capacity: number }>(
      "SELECT status, initiator_id, capacity FROM match_rooms WHERE id = $1 FOR UPDATE",
      [a.room_id],
    );
    const r = room.rows[0];
    if (!r) return { ok: false, error: "房间不存在" };
    // 权限：只有发起人能审批
    if (r.initiator_id !== actorId) return { ok: false, error: "只有发起人可以处理申请" };
    if (r.status === "cancelled" || r.status === "expired") {
      return { ok: false, error: "房间已结束，无法处理申请" };
    }

    if (approve) {
      // +1 为发起人本人（见 syncRoomStatus 的说明）
      const memberCount = await countApproved(client, a.room_id);
      if (memberCount + 1 >= r.capacity) {
        return { ok: false, error: "房间已满，无法再同意" };
      }
    }

    await client.query(
      "UPDATE room_applications SET status = $2, decided_at = now() WHERE id = $1",
      [applicationId, approve ? "approved" : "rejected"],
    );

    if (approve) await syncRoomStatus(client, a.room_id);
    return { ok: true, roomId: a.room_id, applicantId: a.applicant_id, actorId };
}

/**
 * 退出房间（已加入的成员）。
 *
 * 这是状态机里「full → open」的那条边：退出后必须重新可申请。
 */
export async function withdraw(roomId: string, userId: string): Promise<ActionResult> {
  const result = await withTransaction(async (client) => {
    return withdrawTx(client, roomId, userId);
  });

  if (!result.ok) return result;

  // 通知在事务之后发
  const [slot, who] = await Promise.all([roomSlot(roomId), userName(userId)]);
  await notifyRoom({
    roomId,
    to: result.initiatorId,
    kind: "room.withdrawn",
    title: who + " 退出了你的约球",
    body: "时间：" + slot + "\n空位已恢复，其他人可以再申请。",
    dedupeKey: null,
  });

  return { ok: true };
}

/** 退出的事务部分。 */
async function withdrawTx(
  client: PoolClient,
  roomId: string,
  userId: string,
): Promise<{ ok: true; initiatorId: string } | { ok: false; error: string }> {
  const room = await client.query<{ initiator_id: string; status: RoomStatus }>(
    "SELECT initiator_id, status FROM match_rooms WHERE id = $1 FOR UPDATE",
    [roomId],
  );
  const r = room.rows[0];
  if (!r) return { ok: false, error: "房间不存在" };
  if (r.initiator_id === userId) return { ok: false, error: "发起人不能退出，请取消房间" };

  const updated = await client.query(
    `UPDATE room_applications SET status = 'withdrawn', decided_at = now()
      WHERE room_id = $1 AND applicant_id = $2 AND status = 'approved'`,
    [roomId, userId],
  );
  if ((updated.rowCount ?? 0) === 0) {
    return { ok: false, error: "你不在这个房间里" };
  }

  // 退出即恢复空位：房间重新开放
  await syncRoomStatus(client, roomId);
  return { ok: true, initiatorId: r.initiator_id };
}

/** 取消房间（仅发起人）。已加入者不受影响，房间从列表消失，无信誉影响（D-29）。 */
export async function cancelRoom(roomId: string, userId: string): Promise<ActionResult> {
  // ⚠️ 名单必须在事务**之前**取：事务里会把 pending 申请置为 expired，
  //    而 approved 的人正是要通知的对象。取早了不影响正确性，取晚了会漏。
  const members = await approvedMemberIds(roomId);
  const slot = await roomSlot(roomId);

  const result = await withTransaction(async (client) => {
    return cancelRoomTx(client, roomId, userId);
  });

  if (!result.ok) return result;

  // 通知所有已加入的成员（发起人自己不用通知自己）
  await Promise.all(
    members
      .filter((id) => id !== userId)
      .map((id) =>
        notifyRoom({
          roomId,
          to: id,
          kind: "room.cancelled",
          title: "你参加的约球已被取消",
          body: "时间：" + slot,
          dedupeKey: null,
        }),
      ),
  );

  return { ok: true };
}

/** 取消房间的事务部分（仅发起人）。 */
async function cancelRoomTx(
  client: PoolClient,
  roomId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const room = await client.query<{ initiator_id: string; status: RoomStatus }>(
    "SELECT initiator_id, status FROM match_rooms WHERE id = $1 FOR UPDATE",
    [roomId],
  );
  const r = room.rows[0];
  if (!r) return { ok: false, error: "房间不存在" };
  if (r.initiator_id !== userId) return { ok: false, error: "只有发起人可以取消房间" };
  if (r.status === "cancelled") return { ok: false, error: "房间已经取消了" };
  if (r.status === "expired") return { ok: false, error: "房间已过期" };

  await client.query(
    "UPDATE match_rooms SET status = 'cancelled', cancelled_at = now() WHERE id = $1",
    [roomId],
  );
  // 未处理的申请一并结束，避免留下永远等不到结果的 pending
  await client.query(
    `UPDATE room_applications SET status = 'expired', decided_at = now()
      WHERE room_id = $1 AND status = 'pending'`,
    [roomId],
  );
  return { ok: true };
}

/**
 * 约球相关的通知辅助。
 *
 * ⚠️ 这些调用必须在**事务提交之后**发生。理由与审计模块一致：
 *   通知失败绝不能回滚「申请/审批」这个业务动作 —— 那是本末倒置。
 *   而且 notifications 表与业务表不同源，在事务里写会拉长持锁时间。
 */
async function notifyRoom(
  input: {
    roomId: string;
    /** 收件人 */
    to: string;
    kind: Parameters<typeof notify>[0]["kind"];
    title: string;
    body?: string | null;
    dedupeKey?: string | null;
  },
): Promise<void> {
  await notify({
    userId: input.to,
    kind: input.kind,
    title: input.title,
    body: input.body,
    link: `/rooms/${input.roomId}`,
    dedupeKey: input.dedupeKey ?? null,
  });
}

/**
 * 取房间的时间段文案（通知里要写清是哪个约球）。
 *
 * ⚠️ D-44 把 `time_slot`（自由文本）换成了 `start_at`/`end_at`（真实时间戳），
 * 这个函数当时**漏改**，仍在查旧列名 → 取消约球时直接报
 * `column "time_slot" does not exist`，接口 500。
 *
 * 现在复用 formatRoomTime —— 通知里显示的措辞与页面保持一致，
 * 不再有第二处各自拼时间文案的地方。
 */
async function roomSlot(roomId: string): Promise<string> {
  const row = await queryOne<{ start_at: string; end_at: string | null }>(
    "SELECT start_at, end_at FROM match_rooms WHERE id = $1",
    [roomId],
  );
  if (!row) return "某个约球";
  return formatRoomTime(row.start_at, row.end_at);
}

/** 取用户姓名（通知里用姓名而不是「有人」，成员之间本来就互相可见姓名）。 */
async function userName(userId: string): Promise<string> {
  const row = await queryOne<{ name: string }>("SELECT name FROM users WHERE id = $1", [userId]);
  return row?.name ?? "某位成员";
}

/** 取房间里所有已通过的人（用于「房间被取消」这类要通知全体的场景）。 */
async function approvedMemberIds(roomId: string): Promise<string[]> {
  const rows = await query<{ applicant_id: string }>(
    "SELECT applicant_id FROM room_applications WHERE room_id = $1 AND status = 'approved'",
    [roomId],
  );
  return rows.map((r) => r.applicant_id);
}

async function countApproved(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, string>[] }> },
  roomId: string,
): Promise<number> {
  const res = await client.query(
    `SELECT count(*)::text AS n FROM room_applications
      WHERE room_id = $1 AND status = 'approved'`,
    [roomId],
  );
  return Number(res.rows[0]?.n ?? 0);
}

// ---------------------------------------------------------------------------
// 视图辅助
// ---------------------------------------------------------------------------

export interface RoomMember {
  userId: string;
  name: string;
  selfRating: number;
  isInitiator: boolean;
}

export interface RoomApplication {
  applicationId: string;
  userId: string;
  name: string;
  selfRating: number;
  note: string | null;
  status: ApplicationStatus;
  appliedAt: string;
}

/**
 * 房间成员与申请。
 *
 * 成员的自评分一并带出 —— D-24 要求约球界面展示参与者自评分，供他人参考水平。
 */
export async function getRoomDetail(roomId: string): Promise<{
  members: RoomMember[];
  applications: RoomApplication[];
} | null> {
  const room = await queryOne<{ initiator_id: string }>(
    "SELECT initiator_id FROM match_rooms WHERE id = $1",
    [roomId],
  );
  if (!room) return null;

  const [members, applications] = await Promise.all([
    query<{ user_id: string; name: string; self_rating: number; is_initiator: boolean }>(
      `SELECT u.id AS user_id, u.name, u.self_rating,
              (u.id = $2) AS is_initiator
         FROM users u
        WHERE u.id = $2
        UNION
       SELECT u.id, u.name, u.self_rating, false
         FROM room_applications a JOIN users u ON u.id = a.applicant_id
        WHERE a.room_id = $1 AND a.status = 'approved'`,
      [roomId, room.initiator_id],
    ),
    query<{
      application_id: string;
      user_id: string;
      name: string;
      self_rating: number;
      status: ApplicationStatus;
      applied_at: string;
    }>(
      `SELECT a.id AS application_id, u.id AS user_id, u.name, u.self_rating,
              a.status, a.applied_at
         FROM room_applications a JOIN users u ON u.id = a.applicant_id
        WHERE a.room_id = $1 AND a.status IN ('pending','approved')
        ORDER BY a.applied_at`,
      [roomId],
    ),
  ]);

  return {
    members: members.map((m) => ({
      userId: m.user_id,
      name: m.name,
      selfRating: m.self_rating,
      isInitiator: m.is_initiator,
    })),
    applications: applications.map((a) => ({
      applicationId: a.application_id,
      userId: a.user_id,
      name: a.name,
      selfRating: a.self_rating,
      note: null,
      status: a.status,
      appliedAt: a.applied_at,
    })),
  };
}
