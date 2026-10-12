/**
 * 活动签到与缺席。
 *
 * 依据 D-20 的签到规则：
 *   - **管理员在现场**确认人员到场并签到，成员侧**无需任何操作**
 *   - 不存在成员自助签到入口、不做时间窗校验、不做防代签（人工目视把关）
 *
 * 依据 D-28 第三条（关闭 Q58）：
 *   - 未到场者标记 `absent`，**无积分后果**
 *   - 但名额已满时**候补优先级靠后** —— 项目唯一的成员信誉机制
 *   - 管理员可**事后补签**
 */

import { query, queryOne, withTransaction } from "@/lib/db";

export interface RosterEntry {
  userId: string;
  name: string;
  qqNumber: string;
  status: string;
  checkedInAt: string | null;
  partnerName: string | null;
}

/** 某赛事的报名名单（含候补与缺席），供管理员现场使用。 */
export async function listRoster(eventId: string): Promise<RosterEntry[]> {
  const rows = await query<{
    user_id: string;
    name: string;
    qq_number: string;
    status: string;
    checked_in_at: string | null;
    partner_name: string | null;
  }>(
    `SELECT r.user_id,
            u.name,
            u.qq_number,
            r.status,
            r.checked_in_at,
            (SELECT pu.name
               FROM pairings p
               JOIN users pu
                 ON pu.id = CASE WHEN p.user_a_id = r.user_id THEN p.user_b_id ELSE p.user_a_id END
              WHERE p.event_id = r.event_id
                AND p.status = 'confirmed'
                AND (p.user_a_id = r.user_id OR p.user_b_id = r.user_id)
              LIMIT 1) AS partner_name
       FROM event_registrations r
       JOIN users u ON u.id = r.user_id
      WHERE r.event_id = $1
        AND r.status <> 'cancelled'
      ORDER BY
        -- 正式报名在前，候补在后；同组内按报名时间
        CASE r.status WHEN 'registered' THEN 0 WHEN 'absent' THEN 1 ELSE 2 END,
        r.registered_at`,
    [eventId],
  );

  return rows.map((r) => ({
    userId: r.user_id,
    name: r.name,
    qqNumber: r.qq_number,
    status: r.status,
    checkedInAt: r.checked_in_at,
    partnerName: r.partner_name,
  }));
}

export type MarkResult = { ok: true } | { ok: false; error: string };

/** 现场签到（管理员操作）。可重复调用以覆盖。 */
export async function checkIn(eventId: string, userId: string): Promise<MarkResult> {
  const row = await queryOne<{ status: string }>(
    "SELECT status FROM event_registrations WHERE event_id = $1 AND user_id = $2",
    [eventId, userId],
  );
  if (!row) return { ok: false, error: "该成员没有报名这个赛事" };

  // 签到同时把状态从 absent 纠正回 registered —— 这正是「事后补签」要解决的情况

  await query(
    `UPDATE event_registrations
        SET checked_in_at = now(),
            status = CASE WHEN status = 'absent' THEN 'registered' ELSE status END
      WHERE event_id = $1 AND user_id = $2`,
    [eventId, userId],
  );
  return { ok: true };
}

/** 撤销签到（现场点错了）。 */
export async function undoCheckIn(eventId: string, userId: string): Promise<MarkResult> {
  await query(
    "UPDATE event_registrations SET checked_in_at = NULL WHERE event_id = $1 AND user_id = $2",
    [eventId, userId],
  );
  return { ok: true };
}

/**
 * 标记缺席（活动结束后由管理员执行）。
 *
 * 只对「已报名但没签到」的人生效 —— 这是 absent 状态存在的意义：
 * 活动没结束时无法判断，活动结束后才能认定。
 */
export async function markAbsent(eventId: string): Promise<{ ok: true; marked: number }> {
  return withTransaction(async (client) => {
    const res = await client.query(
      `UPDATE event_registrations
          SET status = 'absent'
        WHERE event_id = $1
          AND status = 'registered'
          AND checked_in_at IS NULL`,
      [eventId],
    );
    return { ok: true as const, marked: res.rowCount ?? 0 };
  });
}

/** 缺席次数（用于候补优先级）。 */
export async function absentCount(userId: string): Promise<number> {
  const row = await queryOne<{ n: string }>(
    "SELECT count(*)::text AS n FROM event_registrations WHERE user_id = $1 AND status = 'absent'",
    [userId],
  );
  return Number(row?.n ?? 0);
}
