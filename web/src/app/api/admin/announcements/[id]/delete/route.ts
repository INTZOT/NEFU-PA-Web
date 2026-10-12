import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { remove } from "@/modules/announcement/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");
  if (!isAdmin(user)) return redirectTo(request, "/me");

  const { id } = await params;
  await remove(id);

  return redirectTo(request, "/admin/announcements?ok=" + encodeURIComponent("公告已删除"));
}
