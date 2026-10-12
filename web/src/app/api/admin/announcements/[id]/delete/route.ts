import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { remove, getById } from "@/modules/announcement/service";
import { record } from "@/modules/audit/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");
  if (!isAdmin(user)) return redirectTo(request, "/me");

  const { id } = await params;

  // 删除后取不到标题，因此先读出来用于留痕
  const existing = await getById(id);
  await remove(id);
  await record(user, "announcement.delete", existing?.title ?? id);

  return redirectTo(request, "/admin/announcements?ok=" + encodeURIComponent("公告已删除"));
}
