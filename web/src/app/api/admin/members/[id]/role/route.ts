import { getCurrentUser } from "@/lib/session";
import { isSuperAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { setRole, getMemberName } from "@/modules/account/admin";
import { record } from "@/modules/audit/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");
  // 页面已按超管限制，但接口必须自己再判一次（否则管理员可直接构请求提权）
  if (!isSuperAdmin(user)) {
    return redirectTo(request, `/admin?error=${encodeURIComponent("只有超级管理员可以设置管理员")}`);
  }

  const { id } = await params;
  const form = await request.formData();
  const role = String(form.get("role") ?? "");

  if (role !== "member" && role !== "admin") {
    return redirectTo(request, `/admin/members?error=${encodeURIComponent("角色值不合法")}`);
  }

  // 先取名字：角色变更后无法再区分「刚被设为管理员的人是谁」的旧角色，
  // 但名字与本次动作用来写日志，必须在成功前拿到
  const targetName = await getMemberName(id);

  const result = await setRole(id, role, user.id);
  if (!result.ok) {
    return redirectTo(request, `/admin/members?error=${encodeURIComponent(result.error)}`);
  }

  await record(
    user,
    role === "admin" ? "role.grant" : "role.revoke",
    `${targetName ?? "（未知成员）"} → ${role === "admin" ? "管理员" : "成员"}`,
  );

  const message = role === "admin" ? "已设为管理员" : "已取消管理员";
  return redirectTo(request, `/admin/members?ok=${encodeURIComponent(message)}`);
}
