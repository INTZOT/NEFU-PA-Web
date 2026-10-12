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

import { query } from "@/lib/db";

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

export async function getBio(userId: string): Promise<string | null> {
  const rows = await query<{ bio: string | null }>("SELECT bio FROM users WHERE id = $1", [
    userId,
  ]);
  return rows[0]?.bio ?? null;
}
