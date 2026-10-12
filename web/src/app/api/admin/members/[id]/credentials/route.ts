import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { applyCredentials, parseCredentials, getCredentialInfo } from "@/modules/account/credentials";
import { record } from "@/modules/audit/service";
import { queryOne } from "@/lib/db";

/**
 * 管理员代改凭据（R-42 / D-16 的「QQ 死局」兜底）。
 *
 * 场景：用户 QQ 号被盗/停用，无法通过机器人自助重置，
 * 此时只有管理员能帮他换绑到新的 QQ 号 —— 这是项目唯一的救回路径。
 *
 * 与自助换绑共用 applyCredentials，保证唯一性校验等规则只有一份。
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");
  if (!isAdmin(user)) return redirectTo(request, "/me");

  const { id } = await params;
  const back = "/admin/members";

  // D-27 的边界：管理员不得操作超管账号
  const target = await queryOne<{ role: string }>("SELECT role FROM users WHERE id = $1", [id]);
  if (!target) return redirectTo(request, `${back}?error=${encodeURIComponent("该成员不存在")}`);
  if (target.role === "super_admin") {
    return redirectTo(request, `${back}?error=${encodeURIComponent("不能修改超级管理员的凭据")}`);
  }

  const form = await request.formData();
  const parsed = parseCredentials({
    qqNumber: String(form.get("qqNumber") ?? ""),
    studentId: String(form.get("studentId") ?? ""),
  });
  if (!parsed.ok) {
    return redirectTo(request, `${back}?error=${encodeURIComponent(parsed.error)}`);
  }

  const result = await applyCredentials(id, parsed.value);
  if (!result.ok) {
    return redirectTo(request, `${back}?error=${encodeURIComponent(result.error)}`);
  }

  const info = await getCredentialInfo(id);
  await record(user, "credential.admin", `${info?.name ?? id}：${result.changed.join("；")}`);

  return redirectTo(request, `${back}?ok=${encodeURIComponent(result.changed.join("；"))}`);
}
