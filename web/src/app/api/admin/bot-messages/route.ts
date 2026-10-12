import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { BOT_MESSAGES, validateTemplate } from "@/modules/bot/messages";
import { saveSettings } from "@/modules/setting/save";
import { record } from "@/modules/audit/service";

/**
 * 保存机器人回复文案。
 *
 * 关键校验是**占位符**：注册引导里的 `{code}` 就是邀请码本身，
 * 管理员若不小心删掉它，机器人就再也发不出邀请码 —— 而且不会报错，
 * 只是「回复里没有码」，极难排查。因此在保存时强制拦住。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");
  if (!isAdmin(user)) return redirectTo(request, "/me");

  const back = "/admin/bot-messages";
  const form = await request.formData();

  const result = await saveSettings(
    form,
    BOT_MESSAGES.map((def) => ({
      key: def.key,
      label: def.label,
      maxLength: def.maxLength,
      validate: (value: string) => {
        const check = validateTemplate(def, value);
        return check.ok ? null : check.error;
      },
    })),
    user.id,
  );

  if (!result.ok) {
    return redirectTo(request, `${back}?error=${encodeURIComponent(result.error)}`);
  }

  await record(user, "site.update", `机器人文案：${result.changed.join("、")}`);
  return redirectTo(
    request,
    `${back}?ok=${encodeURIComponent("已保存。机器人下次回复即生效，无需重启。")}`,
  );
}
