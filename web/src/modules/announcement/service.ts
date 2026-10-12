/**
 * 公告读写。
 *
 * 依据：
 *   - R-08：功能「社团公告」
 *   - R-43 / D-16：由管理员发布，这是管理员的核心职责之一
 *
 * 说明：公告的可见性是公开的（游客也能看，见 R-179 的待定项），
 *       因此这里不做任何过滤；「谁能写」由调用方（后台）判断。
 */

import { query, queryOne } from "@/lib/db";

export interface Announcement {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  category: string | null;
  publishedAt: string;
  expiresAt: string | null;
  authorName: string | null;
}

interface Row {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  category: string | null;
  published_at: string;
  expires_at: string | null;
  author_name: string | null;
}

function toAnnouncement(row: Row): Announcement {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    isPinned: row.is_pinned,
    category: row.category,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    authorName: row.author_name,
  };
}

const SELECT_COLUMNS = `
  a.id, a.title, a.content, a.is_pinned, a.category,
  a.published_at, a.expires_at, u.name AS author_name
`;

/**
 * 展示用的公告列表：置顶优先，其余按发布时间倒序。
 * 已过期的公告自动排除。
 */
export async function listPublished(limit = 20): Promise<Announcement[]> {
  const rows = await query<Row>(
    `SELECT ${SELECT_COLUMNS}
       FROM announcements a
       LEFT JOIN users u ON u.id = a.created_by
      WHERE a.expires_at IS NULL OR a.expires_at > now()
      ORDER BY a.is_pinned DESC, a.published_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map(toAnnouncement);
}

/** 后台列表：包含已过期的，便于管理员处理。 */
export async function listAll(): Promise<Announcement[]> {
  const rows = await query<Row>(
    `SELECT ${SELECT_COLUMNS}
       FROM announcements a
       LEFT JOIN users u ON u.id = a.created_by
      ORDER BY a.is_pinned DESC, a.published_at DESC`,
  );
  return rows.map(toAnnouncement);
}

export async function getById(id: string): Promise<Announcement | null> {
  const row = await queryOne<Row>(
    `SELECT ${SELECT_COLUMNS}
       FROM announcements a
       LEFT JOIN users u ON u.id = a.created_by
      WHERE a.id = $1`,
    [id],
  );
  return row ? toAnnouncement(row) : null;
}

export interface AnnouncementInput {
  title: string;
  content: string;
  isPinned: boolean;
  category: string | null;
  expiresAt: Date | null;
}

export async function create(
  input: AnnouncementInput,
  createdBy: string,
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO announcements (title, content, is_pinned, category, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [input.title, input.content, input.isPinned, input.category, input.expiresAt, createdBy],
  );
  if (!row) throw new Error("创建公告失败");
  return row.id;
}

export async function update(id: string, input: AnnouncementInput): Promise<void> {
  await query(
    `UPDATE announcements
        SET title = $2, content = $3, is_pinned = $4, category = $5, expires_at = $6
      WHERE id = $1`,
    [id, input.title, input.content, input.isPinned, input.category, input.expiresAt],
  );
}

export async function remove(id: string): Promise<void> {
  await query("DELETE FROM announcements WHERE id = $1", [id]);
}

/** 表单输入校验。返回错误信息或规范化后的输入。 */
export function parseInput(form: {
  title: string;
  content: string;
  category: string;
  expiresAt: string;
  isPinned: boolean;
}): { ok: true; value: AnnouncementInput } | { ok: false; error: string } {
  const title = form.title.trim();
  const content = form.content.trim();

  if (!title) return { ok: false, error: "标题不能为空" };
  if (title.length > 100) return { ok: false, error: "标题过长（最多 100 字）" };
  if (!content) return { ok: false, error: "正文不能为空" };

  const category = form.category.trim() || null;

  let expiresAt: Date | null = null;
  const raw = form.expiresAt.trim();
  if (raw) {
    // <input type="date"> 给出的是 YYYY-MM-DD，按当天结束时间处理更符合直觉
    const parsed = new Date(`${raw}T23:59:59`);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "失效日期格式不正确" };
    }
    expiresAt = parsed;
  }

  return { ok: true, value: { title, content, isPinned: form.isPinned, category, expiresAt } };
}
