import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { update, parseInput } from "@/modules/announcement/service";
import { record } from "@/modules/audit/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");
  if (!isAdmin(user)) return redirectTo(request, "/me");

  const { id } = await params;
  const form = await request.formData();
  const parsed = parseInput({
    title: String(form.get("title") ?? ""),
    content: String(form.get("content") ?? ""),
    category: String(form.get("category") ?? ""),
    expiresAt: String(form.get("expiresAt") ?? ""),
    isPinned: form.get("isPinned") !== null,
  });

  if (!parsed.ok) {
    return redirectTo(request, `/admin/announcements/${id}?error=${encodeURIComponent(parsed.error)}`);
  }

  await update(id, parsed.value);
  await record(user, "announcement.update", parsed.value.title);

  return redirectTo(request, `/admin/announcements/${id}?ok=${encodeURIComponent("已保存")}`);
}
