import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { create, parseInput } from "@/modules/announcement/service";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");
  // 权限不足不能只靠页面隐藏入口，接口必须自己再判一次
  if (!isAdmin(user)) return redirectTo(request, "/me");

  const form = await request.formData();
  const parsed = parseInput({
    title: String(form.get("title") ?? ""),
    content: String(form.get("content") ?? ""),
    category: String(form.get("category") ?? ""),
    expiresAt: String(form.get("expiresAt") ?? ""),
    isPinned: form.get("isPinned") !== null,
  });

  if (!parsed.ok) {
    return redirectTo(request, `/admin/announcements/new?error=${encodeURIComponent(parsed.error)}`);
  }

  await create(parsed.value, user.id);
  return redirectTo(request, "/admin/announcements?ok=" + encodeURIComponent("公告已发布"));
}
