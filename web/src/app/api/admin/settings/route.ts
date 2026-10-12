import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { SETTING_DEFS } from "@/modules/setting/service";
import { saveSettings } from "@/modules/setting/save";
import { record } from "@/modules/audit/service";

/**
 * 保存首页文案。
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

  const result = await saveSettings(form, SETTING_DEFS, user.id);
  if (!result.ok) {
    return redirectTo(request, `${back}?error=${encodeURIComponent(result.error)}`);
  }

  await record(user, "site.update", result.changed.join("、"));
  return redirectTo(request, `${back}?ok=${encodeURIComponent("已保存，刷新首页即可看到")}`);
}
