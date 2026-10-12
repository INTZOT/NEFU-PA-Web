/**
 * 社团介绍读写。
 *
 * 依据 M1 / R-07：概况、组织架构、章程、联系方式四块固定内容，游客可见，管理员可编辑。
 */

import { query } from "@/lib/db";

/** slug 与顺序在此固定，与 002 迁移的约束一致。 */
export const CLUB_SECTIONS = [
  { slug: "overview", title: "社团概况" },
  { slug: "organization", title: "组织架构" },
  { slug: "charter", title: "社团章程" },
  { slug: "contact", title: "联系方式" },
] as const;

export type ClubSlug = (typeof CLUB_SECTIONS)[number]["slug"];

export interface ClubSection {
  slug: string;
  title: string;
  content: string;
  updatedAt: string;
}

interface Row {
  slug: string;
  title: string;
  content: string;
  updated_at: string;
}

function toSection(row: Row): ClubSection {
  return {
    slug: row.slug,
    title: row.title,
    content: row.content,
    updatedAt: row.updated_at,
  };
}

/** 全部四块，按固定顺序返回（即使库里缺行也会补上，保证页面结构稳定）。 */
export async function listSections(): Promise<ClubSection[]> {
  const rows = await query<Row>(
    "SELECT slug, title, content, updated_at FROM club_pages",
  );
  const byslug = new Map(rows.map((r) => [r.slug, toSection(r)]));

  return CLUB_SECTIONS.map(
    (s) =>
      byslug.get(s.slug) ?? {
        slug: s.slug,
        title: s.title,
        content: "",
        updatedAt: new Date(0).toISOString(),
      },
  );
}

/** 是否已经填过内容（用于判断要不要在公开页显示「尚未填写」）。 */
export function hasContent(section: ClubSection): boolean {
  return section.content.trim().length > 0;
}

/** 保存一块内容（按 slug upsert）。 */
export async function saveSection(
  slug: ClubSlug,
  content: string,
  updatedBy: string,
): Promise<void> {
  const title = CLUB_SECTIONS.find((s) => s.slug === slug)?.title ?? slug;
  await query(
    `INSERT INTO club_pages (slug, title, content, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (slug) DO UPDATE
        SET content = EXCLUDED.content,
            updated_by = EXCLUDED.updated_by,
            updated_at = now()`,
    [slug, title, content, updatedBy],
  );
}
