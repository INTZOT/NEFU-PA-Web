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
    // 首页文案不允许空 —— 空了页面会很难看。
    // （机器人文案则相反：空值表示「这条不回复」，见 modules/bot/messages.ts）
    validate: (v: string) => (v.trim() ? null : "不能为空"),
    fallback: "东北林业大学匹克球协会",
  },
  {
    key: "home.hero.subtitle",
    label: "首页副标题",
    maxLength: 200,
    multiline: true,
    validate: (v: string) => (v.trim() ? null : "不能为空"),
    fallback:
      "欢迎加入匹克球协会。这里发布社团公告与活动信息；成员登录后可使用约球大厅、活动报名与积分排行。",
  },
  {
    key: "home.group.qq",
    label: "社团 QQ 群号",
    maxLength: 20,
    multiline: false,
    // 必填：首页「怎么加入」要把它显示出来。留空会让新成员不知道该进哪个群。
    validate: (v: string) => (/^[0-9]{5,12}$/.test(v.trim()) ? null : "请填 5~12 位数字的群号"),
    fallback: "1103765322",
  },
] as const;

export type SettingKey = (typeof SETTING_DEFS)[number]["key"];

export interface SettingValue {
  key: string;
  label: string;
  value: string;
  fallback: string;
  /** 该字段允许的最大长度。管理页据此设 maxLength，不要写死。 */
  maxLength: number;
  updatedAt: string | null;
}

/**
 * 读一项配置。
 *
 * **行不存在时**返回 fallback（配置表尚为空 / 该键从未写过）。
 *
 * ⚠️ 但**行存在就用它的值，哪怕是空串** —— 空值是有意义的取值。
 *
 * 这里曾经写成 `value ? value : fallback`，把「设为空」与「没设过」等同起来。
 * 后果：机器人文案 `bot.unknown` 被管理员清空后，取出来又变回默认文案，
 * 「留空即静默」永远不生效 —— 而且后台显示已保存、数据库里确实是空串，
 * 极难排查（实际踩过）。
 *
 * 原来那条「防止页面文案变空白」的意图，改由**写入侧的非空校验**保证
 * （见 modules/setting/save.ts 与各 def 的 validate），前提是首页文案为空会让页面难看。
 *
 * `explicitFallback` 供**不在 SETTING_DEFS 里**的键使用
 * （如机器人文案，其定义在 modules/bot/messages.ts）。
 */
export async function getValue(
  key: string,
  explicitFallback?: string,
): Promise<string> {
  const def = SETTING_DEFS.find((d) => d.key === key);
  const row = await queryOne<{ value: string }>(
    "SELECT value FROM site_settings WHERE key = $1",
    [key],
  );
  if (row) return row.value;
  return def?.fallback ?? explicitFallback ?? "";
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
      maxLength: def.maxLength,
      updatedAt: row?.updated_at ?? null,
    };
  });
}
