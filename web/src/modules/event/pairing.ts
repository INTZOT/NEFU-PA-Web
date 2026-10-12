/**
 * 双打搭档配对。
 *
 * 依据 D-20：
 *   - 双打在**报名时登记搭档**，**双向确认**（一方登记 → 对方同意）
 *   - 名额**按队算**，因此两人确认后合占一个名额
 *   - 允许**单人报名**，由**管理员后配**（双方仍需同意）
 *
 * 依据 D-28 第二条：任一成员取消 → 整队释放（取消逻辑在 service.cancel 里）。
 *
 * 这是项目里第三套「申请—同意」机制（另两套是约球房间加入、日常对局确认，
 * 后者已作废）。三套形态相似但语义不同，此处不强行抽象 —— 它们分属不同模块，
 * 强行合并反而会造出一个谁都不完全适合的通用模型。
 */

import { query, queryOne, withTransaction } from "@/lib/db";

export type PairingStatus = "pending" | "confirmed" | "rejected" | "cancelled";

export interface Pairing {
  id: string;
  eventId: string;
  userAId: string;
  userBId: string;
  initiatedBy: string;
  proposedBy: "member" | "admin";
  status: PairingStatus;
}

interface Row {
  id: string;
  event_id: string;
  user_a_id: string;
  user_b_id: string;
  initiated_by: string;
  proposed_by: "member" | "admin";
  status: PairingStatus;
}

function toPairing(r: Row): Pairing {
  return {
    id: r.id,
    eventId: r.event_id,
    userAId: r.user_a_id,
    userBId: r.user_b_id,
    initiatedBy: r.initiated_by,
    proposedBy: r.proposed_by,
    status: r.status,
  };
}

/** 我参与的、仍待我表态的配对邀请（对方发起，或管理员指派）。 */
export interface PendingInvite {
  pairingId: string;
  eventId: string;
  eventTitle: string;
  partnerName: string;
  proposedBy: "member" | "admin";
}

export async function listPendingForUser(userId: string): Promise<PendingInvite[]> {
  const rows = await query<{
    pairing_id: string;
    event_id: string;
    event_title: string;
    partner_name: string;
    proposed_by: "member" | "admin";
  }>(
    `SELECT p.id   AS pairing_id,
            e.id   AS event_id,
            e.title AS event_title,
            u.name AS partner_name,
            p.proposed_by
       FROM pairings p
       JOIN events e ON e.id = p.event_id
       JOIN users  u ON u.id = p.initiated_by
      WHERE p.status = 'pending'
        -- 待我表态：我是其中一方，但不是发起人
        AND (p.user_a_id = $1 OR p.user_b_id = $1)
        AND p.initiated_by <> $1
      ORDER BY p.created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    pairingId: r.pairing_id,
    eventId: r.event_id,
    eventTitle: r.event_title,
    partnerName: r.partner_name,
    proposedBy: r.proposed_by,
  }));
}

/** 我在某赛事里已确认的搭档。 */
export async function getPartner(
  eventId: string,
  userId: string,
): Promise<{ pairingId: string; partnerName: string } | null> {
  const row = await queryOne<{ pairing_id: string; partner_name: string }>(
    `SELECT p.id AS pairing_id, u.name AS partner_name
       FROM pairings p
       JOIN users u
         ON u.id = CASE WHEN p.user_a_id = $2 THEN p.user_b_id ELSE p.user_a_id END
      WHERE p.event_id = $1
        AND p.status = 'confirmed'
        AND (p.user_a_id = $2 OR p.user_b_id = $2)`,
    [eventId, userId],
  );
  return row ? { pairingId: row.pairing_id, partnerName: row.partner_name } : null;
}

export type PairingResult = { ok: true } | { ok: false; error: string };

/**
 * 登记搭档（发起配对）。
 *
 * 调用前应确保发起人已报名（见 /api/events/[id]/partner）。
 * 不会重复建：若已有 pending 且由我发起，直接返回成功（幂等）。
 */
export async function invitePartner(
  eventId: string,
  initiatorId: string,
  partnerId: string,
  proposedBy: "member" | "admin" = "member",
): Promise<PairingResult> {
  if (initiatorId === partnerId) {
    return { ok: false, error: "不能和自己搭档" };
  }

  return withTransaction(async (client) => {
    for (const uid of [initiatorId, partnerId]) {
      const reg = await client.query<{ status: string }>(
        "SELECT status FROM event_registrations WHERE event_id = $1 AND user_id = $2",
        [eventId, uid],
      );
      const status = reg.rows[0]?.status;
      if (!status) {
        return { ok: false, error: "双方都必须先报名这个赛事" };
      }
    }

    // 任一方已经有确认的搭档 → 拒绝（一人一队）
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM pairings
        WHERE event_id = $1 AND status = 'confirmed'
          AND (user_a_id IN ($2, $3) OR user_b_id IN ($2, $3))`,
      [eventId, initiatorId, partnerId],
    );
    if (existing.rows.length > 0) {
      return { ok: false, error: "其中一方已经有搭档了" };
    }

    // 清理旧的未决邀请，避免堆积
    await client.query(
      `UPDATE pairings SET status = 'cancelled'
        WHERE event_id = $1 AND status = 'pending'
          AND (user_a_id IN ($2, $3) OR user_b_id IN ($2, $3))`,
      [eventId, initiatorId, partnerId],
    );

    await client.query(
      `INSERT INTO pairings (event_id, user_a_id, user_b_id, initiated_by, proposed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [eventId, initiatorId, partnerId, initiatorId, proposedBy],
    );

    return { ok: true };
  });
}

/**
 * 同意配对。
 *
 * 确认时名额会**合并**：两人原本各占 1 个名额，确认后合占 1 个，
 * 因此可能出现「原本已满、确认后释放出一个名额」的情况 —— 需要自动递补。
 */
export async function acceptPairing(
  pairingId: string,
  userId: string,
): Promise<PairingResult & { promoted?: string | null }> {
  return withTransaction(async (client) => {
    const p = await client.query<Row>(
      "SELECT * FROM pairings WHERE id = $1 FOR UPDATE",
      [pairingId],
    );
    const pairing = p.rows[0];
    if (!pairing) return { ok: false, error: "配对邀请不存在" };
    if (pairing.status !== "pending") return { ok: false, error: "这个邀请已经处理过了" };
    if (pairing.user_a_id !== userId && pairing.user_b_id !== userId) {
      return { ok: false, error: "这个邀请不是发给你的" };
    }
    if (pairing.initiated_by === userId) {
      return { ok: false, error: "这是你自己发起的邀请，需要对方确认" };
    }

    // 锁住赛事行：确认会改变名额占用，必须与报名/取消串行
    await client.query("SELECT id FROM events WHERE id = $1 FOR UPDATE", [pairing.event_id]);

    await client.query("UPDATE pairings SET status = 'confirmed' WHERE id = $1", [pairingId]);

    // 两人组成完整队伍，因此双方都应是「正式报名」——
    // 否则会出现「队已完整但成员仍挂在候补队列里」这种矛盾状态。
    // 名额占用在确认的那一刻从 2 降为 1（见 countOccupied 的口径），
    // 所以这不会导致超额。
    await client.query(
      `UPDATE event_registrations
          SET status = 'registered',
              promoted_at = COALESCE(promoted_at, now())
        WHERE event_id = $1 AND user_id IN ($2, $3)
          AND status IN ('waitlisted', 'registered')`,
      [pairing.event_id, pairing.user_a_id, pairing.user_b_id],
    );

    // 名额合并可能导致空出一个名额 → 自动递补最早的候补（D-28 第一条）
    const freed = await maybeReleaseSlot(client, pairing.event_id);

    return { ok: true, promoted: freed };
  });
}

/** 拒绝配对。 */
export async function rejectPairing(
  pairingId: string,
  userId: string,
): Promise<PairingResult> {
  return withTransaction(async (client) => {
    const p = await client.query<Row>("SELECT * FROM pairings WHERE id = $1 FOR UPDATE", [
      pairingId,
    ]);
    const pairing = p.rows[0];
    if (!pairing) return { ok: false, error: "配对邀请不存在" };
    if (pairing.status !== "pending") return { ok: false, error: "这个邀请已经处理过了" };
    if (pairing.user_a_id !== userId && pairing.user_b_id !== userId) {
      return { ok: false, error: "这个邀请不是发给你的" };
    }

    await client.query("UPDATE pairings SET status = 'rejected' WHERE id = $1", [pairingId]);
    return { ok: true };
  });
}

/**
 * 名额合并后，若实际占用少于名额上限且仍有候补，则递补一位。
 *
 * 返回被递补者的 user_id。
 */
async function maybeReleaseSlot(
  client: {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, string>[] }>;
  },
  eventId: string,
): Promise<string | null> {
  const cap = await client.query(
    "SELECT capacity FROM events WHERE id = $1",
    [eventId],
  );
  const capacity = Number(cap.rows[0]?.capacity ?? 0);

  const occ = await client.query(
    `WITH confirmed AS (
       SELECT p.user_a_id AS user_id FROM pairings p
        WHERE p.event_id = $1 AND p.status = 'confirmed'
     )
     SELECT count(*)::text AS occupied
       FROM event_registrations r
      WHERE r.event_id = $1 AND r.status = 'registered'
        AND (r.user_id IN (SELECT user_id FROM confirmed)
             OR r.user_id NOT IN (
               SELECT user_a_id FROM pairings WHERE event_id = $1 AND status = 'confirmed'
               UNION
               SELECT user_b_id FROM pairings WHERE event_id = $1 AND status = 'confirmed'
             ))`,
    [eventId],
  );
  const occupied = Number(occ.rows[0]?.occupied ?? 0);
  if (occupied >= capacity) return null;

  // 候补优先级同 service.cancel：先看缺席次数，再按报名时间（D-28 第三条）
  const next = await client.query(
    `SELECT user_id FROM event_registrations
      WHERE event_id = $1 AND status = 'waitlisted'
      ORDER BY
        (SELECT count(*) FROM event_registrations a
          WHERE a.user_id = event_registrations.user_id AND a.status = 'absent'),
        registered_at
      LIMIT 1`,
    [eventId],
  );
  const userId = next.rows[0]?.user_id;
  if (!userId) return null;

  await client.query(
    `UPDATE event_registrations SET status = 'registered', promoted_at = now()
      WHERE event_id = $1 AND user_id = $2`,
    [eventId, userId],
  );
  return userId;
}
