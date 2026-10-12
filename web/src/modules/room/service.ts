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

import { query, queryOne, withTransaction } from "@/lib/db";

export const ROOM_TTL_HOURS = 24;

export type RoomStatus = "open" | "full" | "cancelled" | "expired";
export type ApplicationStatus = "pending" | "approved" | "rejected" | "withdrawn" | "expired";

export interface Room {
  id: string;
  initiatorId: string;
  initiatorName: string;
  timeSlot: string;
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
  time_slot: string;
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
    timeSlot: r.time_slot,
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
  SELECT r.id, r.initiator_id, i.name AS initiator_name, r.time_slot, r.capacity,
         r.note, r.status, r.created_at, r.expires_at,
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
  const rows = await query<RoomRow>(
    `${ROOM_SELECT} WHERE r.status IN ('open','full') ORDER BY r.created_at DESC`,
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
  timeSlot: string;
  capacity: number;
  note: string | null;
}

export type ParseRoomResult =
  | { ok: true; value: RoomInput }
  | { ok: false; error: string };

export function parseRoomInput(form: {
  timeSlot: string;
  capacity: string;
  note: string;
}): ParseRoomResult {
  const timeSlot = form.timeSlot.trim();
  if (!timeSlot) return { ok: false, error: "请填写时间段" };
  if (timeSlot.length > 60) return { ok: false, error: "时间段过长（最多 60 字）" };

  const capacity = Number(form.capacity);
  if (!Number.isInteger(capacity) || capacity < 2) {
    return { ok: false, error: "人数上限至少为 2" };
  }
  if (capacity > 20) return { ok: false, error: "人数上限过大（最多 20）" };

  const note = form.note.trim();
  if (note.length > 200) return { ok: false, error: "备注过长（最多 200 字）" };

  return { ok: true, value: { timeSlot, capacity, note: note || null } };
}

export async function createRoom(input: RoomInput, initiatorId: string): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO match_rooms (initiator_id, time_slot, capacity, note, expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' hours')::interval)
     RETURNING id`,
    [initiatorId, input.timeSlot, input.capacity, input.note, String(ROOM_TTL_HOURS)],
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
  return withTransaction(async (client) => {
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
    return { ok: true };
  });
}

/** 审批（仅发起人）。同意后若满员则锁死房间。 */
export async function decide(
  applicationId: string,
  actorId: string,
  approve: boolean,
): Promise<ActionResult> {
  return withTransaction(async (client) => {
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
    return { ok: true, roomId: a.room_id };
  });
}

/**
 * 退出房间（已加入的成员）。
 *
 * 这是状态机里「full → open」的那条边：退出后必须重新可申请。
 */
export async function withdraw(roomId: string, userId: string): Promise<ActionResult> {
  return withTransaction(async (client) => {
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
    return { ok: true };
  });
}

/** 取消房间（仅发起人）。已加入者不受影响，房间从列表消失，无信誉影响（D-29）。 */
export async function cancelRoom(roomId: string, userId: string): Promise<ActionResult> {
  return withTransaction(async (client) => {
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
  });
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
