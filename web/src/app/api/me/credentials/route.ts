import { getCurrentUser } from "@/lib/session";
import { redirectTo } from "@/lib/redirect";
import { applyCredentials, parseCredentials } from "@/modules/account/credentials";
import { record } from "@/modules/audit/service";

/**
 * 自助换绑（R-27 / D-11）。
 *
 * 为什么不要求输入密码确认：换绑本身需要已登录（会话即凭据），
 * 而 D-11 明确选择「完全自助、无需审批」—— 加二次确认与决策取向不符。
 * 风险由操作留痕兜底：换绑会记入 audit_logs，异常可追溯。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");

  const form = await request.formData();
  const parsed = parseCredentials({
    qqNumber: String(form.get("qqNumber") ?? ""),
    studentId: String(form.get("studentId") ?? ""),
  });

  if (!parsed.ok) {
    return redirectTo(request, `/me?error=${encodeURIComponent(parsed.error)}#credentials`);
  }

  const result = await applyCredentials(user.id, parsed.value);
  if (!result.ok) {
    return redirectTo(request, `/me?error=${encodeURIComponent(result.error)}#credentials`);
  }

  await record(user, "credential.self", result.changed.join("；"));

  return redirectTo(
    request,
    `/me?ok=${encodeURIComponent(`已更新：${result.changed.join("；")}`)}#credentials`,
  );
}
