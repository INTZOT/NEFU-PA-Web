import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { checkIn, undoCheckIn } from "@/modules/event/attendance";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");
  if (!isAdmin(user)) return redirectTo(request, "/me");

  const { id } = await params;
  const back = `/admin/events/${id}`;

  const form = await request.formData();
  const userId = String(form.get("userId") ?? "");
  if (!userId) {
    return redirectTo(request, `${back}?error=${encodeURIComponent("缺少成员")}`);
  }

  // 签到与撤销共用一个端点：现场操作要快，两个按钮不必两个路由

  // 也方便「事后补签」——补签走的是同一个 checkIn（会把 absent 改回 registered）

  const undo = String(form.get("action") ?? "") === "undo";
  const result = undo ? await undoCheckIn(id, userId) : await checkIn(id, userId);

  if (!result.ok) {
    return redirectTo(request, `${back}?error=${encodeURIComponent(result.error)}`);
  }
  return redirectTo(request, `${back}?ok=${encodeURIComponent(undo ? "已撤销签到" : "已签到")}`);
}
