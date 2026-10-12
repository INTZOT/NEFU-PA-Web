/**
 * 站点配置的保存逻辑（供管理后台各页共用）。
 *
 * 为什么抽出来：配置项现在分两组（首页文案、机器人文案），
 * 分属不同管理页。若各写一份保存逻辑，校验规则迟早漂移 ——
 * 比如一处限制了长度、另一处忘了。
 */

import { query } from "@/lib/db";

export interface SaveFieldDef {
  key: string;
  label: string;
  maxLength: number;
  /** 额外校验（如机器人文案的占位符检查）。返回错误信息表示不通过。 */
  validate?: (value: string) => string | null;
}

export type SaveResult =
  | { ok: true; changed: string[] }
  | { ok: false; error: string };

/**
 * 保存一组配置项。
 *
 * 只处理表单里**实际出现**的字段（`form.get` 返回 null 则跳过）——
 * 这样同一套逻辑可以为不同页面服务，各页只提交自己的字段。
 *
 * 任意一项校验失败即整体拒绝，不做部分保存 ——
 * 否则管理员会看到「一半保存了、一半没有」这种难以理解的状态。
 */
export async function saveSettings(
  form: FormData,
  // 接受只读数组：调用方常用 `as const` 声明常量，不必为此改成可变类型
  defs: readonly SaveFieldDef[],
  userId: string,
): Promise<SaveResult> {
  const changed: string[] = [];

  for (const def of defs) {
    const raw = form.get(def.key);
    if (raw === null) continue;

    const value = String(raw).trim();

    if (value.length > def.maxLength) {
      return { ok: false, error: `${def.label}超过 ${def.maxLength} 字` };
    }

    if (def.validate) {
      const err = def.validate(value);
      if (err) return { ok: false, error: `${def.label}：${err}` };
    }

    await query(
      `INSERT INTO site_settings (key, value, label, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value,
              updated_by = EXCLUDED.updated_by,
              updated_at = now()`,
      [def.key, value, def.label, userId],
    );
    changed.push(def.label);
  }

  if (changed.length === 0) {
    return { ok: false, error: "没有需要保存的内容" };
  }
  return { ok: true, changed };
}
