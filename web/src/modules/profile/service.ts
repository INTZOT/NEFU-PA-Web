/**
 * 个人简介。
 *
 * 可见范围与姓名一致（R-53）：**成员之间可见**，不对外公开。
 * 目前展示位置是个人主页；字段本身对成员可读，
 * 供后续在需要判断「这个搭档/队友大概什么水平」的地方使用。
 *
 * 为什么不给简介加操作记录：
 *   简介不是权限相关内容，也不影响他人权益。每次改动都留痕只会淹没真正重要的记录。
 *   （对比：改密码、改角色、删内容都留痕，因为那些有实际影响。）
 */

import { query, queryOne } from "@/lib/db";

/** 上限 100 字。数据库侧有同样的 CHECK 兜底（迁移 014）。 */
export const BIO_MAX = 100;

/**
 * 规范化并校验简介。
 *
 * 返回 null 表示「合法的空简介」（清空），而不是出错。
 * 因此用 ok 区分「校验通过」与「校验失败」两种含义。
 */
export function parseBio(
  raw: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  // 压掉首尾空白；中间的换行替换为空格（简介按单行展示）
  const cleaned = raw.replace(/\s+/g, " ").trim();

  if (cleaned.length > BIO_MAX) {
    return { ok: false, error: `个人简介不能超过 ${BIO_MAX} 字` };
  }

  return { ok: true, value: cleaned.length > 0 ? cleaned : null };
}

export async function updateBio(userId: string, bio: string | null): Promise<void> {
  await query("UPDATE users SET bio = $2 WHERE id = $1", [userId, bio]);
}

/**
 * 成员公开信息。
 *
 * **字段白名单是这里的核心**（D-36）：只返回 R-53 允许与约球/积分场景需要的内容，
 * 其余一律不查、不返回。这样即使将来页面写错，也不会泄露敏感字段。
 *
 * 明确**不包含**：
 *   - 学号（R-53 禁止对任何成员展示）
 *   - QQ 号（公开会让机器人账号被骚扰）
 *   - 行程类信息：我报名的活动、我发起的约球（公开等于暴露行踪）
 */
export interface PublicMember {
  id: string;
  name: string;
  role: string;
  bio: string | null;
  selfRating: number;
  /** 本赛季比赛积分；没有赛季或无记录时为 null。 */
  rating: number | null;
  wins: number | null;
  losses: number | null;
  rank: number | null;
  totalRated: number;
}

/** UUID 的格式校验（不校验版本位）。 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 取某个成员的公开信息。
 *
 * 用**一次查询**带出全部内容（含排名与总人数）—— 排名用窗口函数算，
 * 避免「先查排名再查总数」的两次往返。
 *
 * 为什么先校验 UUID 格式：
 *   `users.id` 是 uuid 类型。传入格式非法的字符串时，PostgreSQL 会在**类型转换**阶段
 *   抛错（`invalid input syntax for type uuid`），直接变成 500。
 *   而路径参数是用户可控的（`/members/任意字符串`），因此必须先挡在数据库之外。
 *   放在 service 而不是页面，是为了让**任何调用方**都受保护。
 */
export async function getPublicMember(
  userId: string,
  seasonId: string | null,
): Promise<PublicMember | null> {
  if (!UUID_RE.test(userId)) return null;

  const base = await queryOne<{ id: string; name: string; role: string; bio: string | null; self_rating: number }>(
    "SELECT id, name, role, bio, self_rating FROM users WHERE id = $1",
    [userId],
  );
  if (!base) return null;

  let rating: number | null = null;
  let wins: number | null = null;
  let losses: number | null = null;
  let rank: number | null = null;
  let totalRated = 0;

  if (seasonId) {
    // 窗口函数一次算出：本人各项数据 + 排名 + 参与排名总人数
    const row = await queryOne<{
      rating: number;
      wins: number;
      losses: number;
      rank: string;
      total: string;
    }>(
      `SELECT rating, wins, losses, rank, total FROM (
         SELECT r.user_id, r.rating, r.wins, r.losses,
                rank() OVER (ORDER BY r.rating DESC, r.matches DESC) AS rank,
                count(*) OVER () AS total
           FROM season_ratings r
          WHERE r.season_id = $1
       ) t WHERE t.user_id = $2`,
      [seasonId, userId],
    );
    if (row) {
      rating = row.rating;
      wins = row.wins;
      losses = row.losses;
      rank = Number(row.rank);
      totalRated = Number(row.total);
    }
  }

  return {
    id: base.id,
    name: base.name,
    role: base.role,
    bio: base.bio,
    selfRating: base.self_rating,
    rating,
    wins,
    losses,
    rank,
    totalRated,
  };
}

export async function getBio(userId: string): Promise<string | null> {
  const rows = await query<{ bio: string | null }>("SELECT bio FROM users WHERE id = $1", [
    userId,
  ]);
  return rows[0]?.bio ?? null;
}