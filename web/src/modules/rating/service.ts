/**
 * 比赛积分结算。
 *
 * 依据 D-09（标准 ELO，K=40，零和，双打取平均且两人同增减）、
 *      D-20（管理员录入，不设双方确认）、
 *      D-25（一赛季 = 一学年，各赛季独立起 500）、
 *      D-30（允许撤销，但只能撤销最近一场）。
 *
 * 本模块是积分数据的**唯一写入口**：
 *   season_ratings.rating / wins / losses / matches 与 rating_ticks
 *   只能由 settle() 与 revokeLast() 改动。
 *
 * 结算算法本身在 elo.ts（纯函数，已逐值校对）；本文件负责数据一致性。
 */

import { query, queryOne, withTransaction } from "@/lib/db";
import { settleMatch, K_FACTOR } from "./elo";

export interface MatchInput {
  eventId: string;
  format: "singles" | "doubles";
  sideA: string[]; // user_id 列表
  sideB: string[];
  winner: "a" | "b";
}

export type SettleResult =
  | { ok: true; matchId: string; deltas: { userId: string; delta: number; ratingAfter: number }[] }
  | { ok: false; error: string };

/**
 * 录入并结算一场官方比赛。
 *
 * **人数校验是本模块的职责**：原 schema 只约束了 format 与 side，
 * 无法表达「单打每侧 1 人、双打每侧 2 人」这类跨表计数（见 D-30 记录）。
 * 而「双打取平均」的正确性完全依赖双方各 2 人，因此必须在这里挡住。
 */
export async function settle(
  input: MatchInput,
  recordedBy: string,
): Promise<SettleResult> {
  const expected = input.format === "doubles" ? 2 : 1;
  if (input.sideA.length !== expected || input.sideB.length !== expected) {
    return {
      ok: false,
      error: `${input.format === "doubles" ? "双打" : "单打"}每侧必须恰好 ${expected} 人（A 侧 ${input.sideA.length} 人、B 侧 ${input.sideB.length} 人）`,
    };
  }

  // 同一个不能出现在两侧，也不能在同一侧重复
  const all = [...input.sideA, ...input.sideB];
  if (new Set(all).size !== all.length) {
    return { ok: false, error: "同一成员不能重复出现在比赛中" };
  }

  return withTransaction(async (client) => {
    // 锁赛事行：结算要与赛季归档、其他结算串行
    const event = await client.query<{ id: string; title: string }>(
      "SELECT id, title FROM events WHERE id = $1 FOR UPDATE",
      [input.eventId],
    );
    if (event.rows.length === 0) return { ok: false, error: "赛事不存在" };

    const season = await client.query<{ id: string }>(
      "SELECT id FROM seasons WHERE status = 'active' LIMIT 1",
    );
    const seasonId = season.rows[0]?.id;
    if (!seasonId) return { ok: false, error: "当前没有进行中的赛季" };

    // 取双方积分（本赛季）。缺失则按 D-25「新成员每赛季仍为 500」补建。
    const ratings = new Map<string, number>();
    for (const userId of all) {
      const row = await client.query<{ rating: number }>(
        "SELECT rating FROM season_ratings WHERE user_id = $1 AND season_id = $2 FOR UPDATE",
        [userId, seasonId],
      );
      if (row.rows[0]) {
        ratings.set(userId, row.rows[0].rating);
      } else {
        await client.query(
          "INSERT INTO season_ratings (user_id, season_id) VALUES ($1, $2)",
          [userId, seasonId],
        );
        ratings.set(userId, 500);
      }
    }

    const ratingsA = input.sideA.map((u) => ratings.get(u)!);
    const ratingsB = input.sideB.map((u) => ratings.get(u)!);

    const s = settleMatch(ratingsA, ratingsB, input.winner, K_FACTOR);

    // 1) 对局记录
    const matchRow = await client.query<{ id: string }>(
      `INSERT INTO match_results
         (event_id, season_id, format, winner, rating_applied, k_factor_used, recorded_by)
       VALUES ($1, $2, $3, $4, true, $5, $6)
       RETURNING id`,
      [input.eventId, seasonId, input.format, input.winner, K_FACTOR, recordedBy],
    );
    const matchId = matchRow.rows[0].id;

    // 2) 参与者
    for (const [side, users] of [
      ["a", input.sideA],
      ["b", input.sideB],
    ] as const) {
      for (const userId of users) {
        await client.query(
          "INSERT INTO match_participants (match_result_id, user_id, side) VALUES ($1, $2, $3)",
          [matchId, userId, side],
        );
      }
    }

    // 3) 积分变动：双方各自用**同一个 Δ**（双打两人增减相同）
    const deltas: { userId: string; delta: number; ratingAfter: number }[] = [];
    for (const [side, users, d] of [
      ["a", input.sideA, s.deltaA],
      ["b", input.sideB, s.deltaB],
    ] as const) {
      const isWinner = input.winner === side;
      for (const userId of users) {
        const before = ratings.get(userId)!;
        const after = before + d;

        await client.query(
          `UPDATE season_ratings
              SET rating = $3,
                  wins   = wins   + $4,
                  losses = losses + $5,
                  matches = matches + 1
            WHERE user_id = $1 AND season_id = $2`,
          [userId, seasonId, after, isWinner ? 1 : 0, isWinner ? 0 : 1],
        );

        await client.query(
          `INSERT INTO rating_ticks
             (user_id, season_id, match_result_id, delta, rating_after,
              team_avg_before, opponent_avg_before)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            userId,
            seasonId,
            matchId,
            d,
            after,
            side === "a" ? s.teamAvgA : s.teamAvgB,
            side === "a" ? s.teamAvgB : s.teamAvgA,
          ],
        );

        deltas.push({ userId, delta: d, ratingAfter: after });
      }
    }

    return { ok: true as const, matchId, deltas };
  });
}

export type RevokeResult =
  | { ok: true; revokedSummary: string }
  | { ok: false; error: string };

/**
 * 撤销**最近一场**结算（D-30 第三条）。
 *
 * 为什么只能撤最近一场：ELO 是链式的，每场的期望值取决于**当时的**积分。
 * 撤销中间某场会让其后所有场次失去依据，必须整体重算 ——
 * 而期间可能有赛季归档，复杂度失控。撤销最后一场则只需减去各自的 delta。
 */
export async function revokeLastSeasonMatch(actorUserId: string): Promise<RevokeResult> {
  return withTransaction(async (client) => {
    const season = await client.query<{ id: string }>(
      "SELECT id FROM seasons WHERE status = 'active' LIMIT 1",
    );
    const seasonId = season.rows[0]?.id;
    if (!seasonId) return { ok: false, error: "当前没有进行中的赛季" };

    const last = await client.query<{ id: string; event_id: string; winner: string; format: string }>(
      `SELECT id, event_id, winner, format FROM match_results
        WHERE season_id = $1 AND rating_applied
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [seasonId],
    );
    const match = last.rows[0];
    if (!match) return { ok: false, error: "本赛季还没有可撤销的对局" };

    await client.query("SELECT id FROM match_results WHERE id = $1 FOR UPDATE", [match.id]);

    const ticks = await client.query<{ user_id: string; delta: number }>(
      "SELECT user_id, delta FROM rating_ticks WHERE match_result_id = $1",
      [match.id],
    );

    for (const t of ticks.rows) {
      const isWinner =
        (await client.query<{ side: string }>(
          "SELECT side FROM match_participants WHERE match_result_id = $1 AND user_id = $2",
          [match.id, t.user_id],
        )).rows[0]?.side === match.winner;

      // 回滚：积分减去 delta，场次与胜负相应减一
      await client.query(
        `UPDATE season_ratings
            SET rating  = rating  - $3,
                wins    = wins    - $4,
                losses  = losses  - $5,
                matches = matches - 1
          WHERE user_id = $1 AND season_id = $2`,
        [t.user_id, seasonId, t.delta, isWinner ? 1 : 0, isWinner ? 0 : 1],
      );
    }

    await client.query("DELETE FROM rating_ticks WHERE match_result_id = $1", [match.id]);
    await client.query("DELETE FROM match_participants WHERE match_result_id = $1", [match.id]);
    await client.query("DELETE FROM match_results WHERE id = $1", [match.id]);

    return {
      ok: true as const,
      revokedSummary: `${match.format === "doubles" ? "双打" : "单打"}（${match.winner.toUpperCase()} 方胜，${ticks.rows.length} 人受影响）`,
    };
  });
}

/** 最近几场已结算的对局（供管理端展示与撤销确认）。 */
export interface RecentMatch {
  id: string;
  eventTitle: string;
  format: string;
  winner: string;
  createdAt: string;
  participants: { userId: string; name: string; side: string; delta: number }[];
}

export async function listRecentMatches(limit = 10): Promise<RecentMatch[]> {
  const matches = await query<{
    id: string;
    event_title: string;
    format: string;
    winner: string;
    created_at: string;
  }>(
    `SELECT m.id, e.title AS event_title, m.format, m.winner, m.created_at
       FROM match_results m
       JOIN events e ON e.id = m.event_id
       JOIN seasons s ON s.id = m.season_id AND s.status = 'active'
      WHERE m.rating_applied
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $1`,
    [limit],
  );

  const result: RecentMatch[] = [];
  for (const m of matches) {
    const parts = await query<{ user_id: string; name: string; side: string; delta: number }>(
      `SELECT p.user_id, u.name, p.side, COALESCE(t.delta, 0) AS delta
         FROM match_participants p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN rating_ticks t
                ON t.match_result_id = p.match_result_id AND t.user_id = p.user_id
        WHERE p.match_result_id = $1
        ORDER BY p.side, u.name`,
      [m.id],
    );
    result.push({
      id: m.id,
      eventTitle: m.event_title,
      format: m.format,
      winner: m.winner,
      createdAt: m.created_at,
      participants: parts.map((p) => ({
        userId: p.user_id,
        name: p.name,
        side: p.side,
        delta: p.delta,
      })),
    });
  }
  return result;
}
