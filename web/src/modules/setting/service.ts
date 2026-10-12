/**
 * 站点可配置文本。
 *
 * 用途：把写死在页面里的文案交到管理员手上（如首页 hero 的标题与副标题）。
 * 依据与 club_pages 同一思路 —— 改一句文案不该需要改代码、重新构建、重新部署。
 *
 * 设计：键值表 + 代码侧维护「有哪些键」，管理页据此渲染表单。
 * 新增一项配置 = 加一个键 + 加一行定义，不需要再写迁移。
 */

import { query, queryOne } from "@/lib/db";

/** 代码侧维护的配置清单（key 必须与迁移里预置的一致）。 */
export const SETTING_DEFS = [
  {
    key: "home.hero.title",
    label: "首页大标题",
    maxLength: 40,
    multiline: false,
    fallback: "东北林业大学匹克球协会",
  },
  {
    key: "home.hero.subtitle",
    label: "首页副标题",
    maxLength: 200,
    multiline: true,
    fallback:
      "欢迎加入匹克球协会。这里发布社团公告与活动信息；成员登录后可使用约球大厅、活动报名与积分排行。",
  },
] as const;

export type SettingKey = (typeof SETTING_DEFS)[number]["key"];

export interface SettingValue {
  key: string;
  label: string;
  value: string;
  fallback: string;
  updatedAt: string | null;
}

/**
 * 读一项配置。
 *
 * **取不到时返回 fallback 而不是空串**：配置表尚为空（或管理员清空过）时，
 * 页面仍应显示原本的文案，不能变成空白。
 */
export async function getValue(key: SettingKey): Promise<string> {
  const def = SETTING_DEFS.find((d) => d.key === key);
  const row = await queryOne<{ value: string }>(
    "SELECT value FROM site_settings WHERE key = $1",
    [key],
  );
  const value = row?.value?.trim();
  return value ? value : (def?.fallback ?? "");
}

/** 管理页用：取出全部配置（含尚未写入库的项）。 */
export async function listAll(): Promise<SettingValue[]> {
  const rows = await query<{ key: string; value: string; updated_at: string }>(
    "SELECT key, value, updated_at FROM site_settings",
  );
  const byKey = new Map(rows.map((r) => [r.key, r]));

  return SETTING_DEFS.map((def) => {
    const row = byKey.get(def.key);
    return {
      key: def.key,
      label: def.label,
      value: row?.value ?? def.fallback,
      fallback: def.fallback,
      updatedAt: row?.updated_at ?? null,
    };
  });
}
