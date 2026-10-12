/**
 * 积分排行榜。
 *
 * 依据：
 *   - R-54：榜上显示**姓名**（不展示学号）；只排**比赛积分**（D-22，不含自评分）
 *   - R-29：排行榜**仅成员可见**（游客看不到）
 *   - D-25：可查**历史赛季**（乙式归档，历史完整保留）
 *   - D-30：分页 + 搜索，**不做**时间筛选；显示积分、场次、胜率，不加场次门槛
 */

import { query, queryOne } from "@/lib/db";

export const PAGE_SIZE = 50;

export interface LeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  rating: number;
  matches: number;
  wins: number;
  losses: number;
  winRate: number | null; // 场次为 0 时为 null（不显示 0%）
}

export interface Season {
  id: string;
  name: string;
  status: string;
}

export async function listSeasons(): Promise<Season[]> {
  return query<Season>(
    "SELECT id, name, status FROM seasons ORDER BY start_date DESC",
  );
}

/** 当前赛季（没有则返回 null）。 */
export async function getActiveSeason(): Promise<Season | null> {
  return queryOne<Season>(
    "SELECT id, name, status FROM seasons WHERE status = 'active' LIMIT 1",
  );
}

/**
 * 取一页排行。
 *
 * 排序：积分降序；同分时**场次多者在前**（打得多的人更可信），
 * 再同则按姓名（保证顺序稳定、分页不跳）。
 */
export async function getLeaderboard(
  seasonId: string,
  options: { page?: number; search?: string } = {},
): Promise<{ rows: LeaderboardRow[]; total: number; page: number; pageCount: number }> {
  const page = Math.max(1, options.page ?? 1);
  const search = (options.search ?? "").trim();
  const offset = (page - 1) * PAGE_SIZE;

  // 参数按下标顺序拼装。
  // 说明：这段之前写成「先给 rows 拼 $1/$2，再给 count 把 $3 换成 $2」，
  // 结果两边的占位符与参数数组对不上（bind message supplies 2 parameters, but
  // prepared statement requires 3），搜索一用就 500。现在改为分别构造，直白可读。
  // ⚠️ 所有榜单查询都必须带 `NOT r.leaderboard_hidden`（D-39）：
  //   用户可自愿退出排行，隐藏者**整个从排名计算中剔除**，
  //   这样「榜上第 N 名」就等于「可见者中的第 N 名」。
  //   若改为「占位但显示已隐藏」，榜单会出现读者无法解释的空洞。
  const filter = search ? "AND (u.name ILIKE $2 OR u.student_id ILIKE $2)" : "";

  const countParams: unknown[] = search ? [seasonId, `%${search}%`] : [seasonId];
  const totalRow = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM season_ratings r JOIN users u ON u.id = r.user_id
      WHERE r.season_id = $1 AND NOT r.leaderboard_hidden ${filter}`,
    countParams,
  );
  const total = Number(totalRow?.n ?? 0);

  const rowsParams: unknown[] = search
    ? [seasonId, `%${search}%`, PAGE_SIZE, offset]
    : [seasonId, PAGE_SIZE, offset];
  const limitIdx = search ? "$3" : "$2";
  const offsetIdx = search ? "$4" : "$3";

  const rows = await query<{
    user_id: string;
    name: string;
    rating: number;
    matches: number;
    wins: number;
    losses: number;
  }>(
    `SELECT r.user_id, u.name, r.rating, r.matches, r.wins, r.losses
       FROM season_ratings r
       JOIN users u ON u.id = r.user_id
      WHERE r.season_id = $1 AND NOT r.leaderboard_hidden ${filter}
      ORDER BY r.rating DESC, r.matches DESC, u.name
      LIMIT ${limitIdx} OFFSET ${offsetIdx}`,
    rowsParams,
  );

  const startRank = offset;
  return {
    rows: rows.map((r, i) => ({
      rank: startRank + i + 1,
      userId: r.user_id,
      name: r.name,
      rating: r.rating,
      matches: r.matches,
      wins: r.wins,
      losses: r.losses,
      // 场次为 0 时不显示胜率：0% 与「没打过」是两回事
      winRate: r.matches > 0 ? Math.round((r.wins / r.matches) * 100) : null,
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** 我的当前排名（用于个人主页显示）。 */
export async function getMyRank(
  seasonId: string,
  userId: string,
): Promise<number | null> {
  // 隐藏者不参与排名计算，因此**没有名次**可显示（D-39）。
  // 与榜单查询保持同一套过滤条件 —— 否则会出现
  // 「自己看到第 3 名，但榜上找不到自己」这种自相矛盾的情况。
  const row = await queryOne<{ rank: string }>(
    `SELECT rank FROM (
       SELECT r.user_id,
              rank() OVER (ORDER BY r.rating DESC, r.matches DESC) AS rank
         FROM season_ratings r
        WHERE r.season_id = $1 AND NOT r.leaderboard_hidden
     ) t WHERE t.user_id = $2`,
    [seasonId, userId],
  );
  return row ? Number(row.rank) : null;
}

/**
 * 该用户本赛季是否已退出排行榜。
 *
 * 取不到记录时返回 false（还没参与赛季 = 谈不上隐藏）。
 */
export async function getHidden(seasonId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ leaderboard_hidden: boolean }>(
    "SELECT leaderboard_hidden FROM season_ratings WHERE season_id = $1 AND user_id = $2",
    [seasonId, userId],
  );
  return row?.leaderboard_hidden === true;
}

/**
 * 设置是否参与排行。
 *
 * 只在已有本赛季积分记录时才有意义 —— 若用户还没有任何比赛，
 * 不存在 season_ratings 行，他本来就不在榜上。
 */
export async function setHidden(
  seasonId: string,
  userId: string,
  hidden: boolean,
): Promise<void> {
  await query(
    "UPDATE season_ratings SET leaderboard_hidden = $3 WHERE season_id = $1 AND user_id = $2",
    [seasonId, userId, hidden],
  );
}