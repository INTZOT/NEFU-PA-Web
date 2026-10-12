import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { query } from "@/lib/db";
import { SETTING_DEFS } from "@/modules/setting/service";
import { record } from "@/modules/audit/service";

/**
 * 保存站点文案。
 *
 * 允许留空：清空即回退到代码里的默认文案（见 setting.getValue 的 fallback），
 * 而不是把首页变成空白。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");
  if (!isAdmin(user)) return redirectTo(request, "/me");

  const back = "/admin/home";
  const form = await request.formData();
  const changed: string[] = [];

  for (const def of SETTING_DEFS) {
    const raw = form.get(def.key);
    if (raw === null) continue; // 表单里没有这一项，跳过

    const value = String(raw).trim();
    if (value.length > def.maxLength) {
      return redirectTo(
        request,
        `${back}?error=${encodeURIComponent(`${def.label}超过 ${def.maxLength} 字`)}`,
      );
    }

    await query(
      `INSERT INTO site_settings (key, value, label, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value,
              updated_by = EXCLUDED.updated_by,
              updated_at = now()`,
      [def.key, value, def.label, user.id],
    );
    changed.push(def.label);
  }

  if (changed.length === 0) {
    return redirectTo(request, `${back}?error=${encodeURIComponent("没有需要保存的内容")}`);
  }

  await record(user, "site.update", changed.join("、"));
  return redirectTo(request, `${back}?ok=${encodeURIComponent("已保存，刷新首页即可看到")}`);
}
