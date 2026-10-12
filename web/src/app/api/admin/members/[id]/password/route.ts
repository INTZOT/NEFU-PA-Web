import { getCurrentUser, invalidateAllSessions } from "@/lib/session";
import { isAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { hashPassword } from "@/lib/password";
import { setPasswordHash, getCredentialInfo } from "@/modules/account/credentials";
import { record } from "@/modules/audit/service";
import { queryOne } from "@/lib/db";

/**
 * 管理员代设密码（R-42 / D-16 的「重置失误」兜底）。
 *
 * 散列直接调用 lib/password.hashPassword —— 它就是全项目唯一实现
 * （机器人走 /api/internal/shared-rules 调的也是同一个函数）。
 * 因此这里不需要绕自己的 HTTP 接口。
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
  const password = String(form.get("password") ?? "");
  if (password.length < 6) {
    return redirectTo(request, `${back}?error=${encodeURIComponent("密码至少 6 位")}`);
  }

  const hash = await hashPassword(password);
  await setPasswordHash(id, hash);

  // 密码是账号的唯一凭据：改密码必须让此前基于旧密码的会话全部失效。
  // 否则「管理员代设密码」这个兜底手段**踢不掉已经入侵的人** ——
  // 而「重置失误/账号被盗」恰恰是这条兜底通道要解决的场景（D-16）。
  const killed = await invalidateAllSessions(id);

  const info = await getCredentialInfo(id);
  await record(
    user,
    "password.admin",
    `${info?.name ?? id}（代设密码，同时失效 ${killed} 个登录会话）`,
  );

  return redirectTo(
    request,
    `${back}?ok=${encodeURIComponent(`已为 ${info?.name ?? "该成员"} 设置临时密码，其原有登录已全部失效`)}`,
  );
}
