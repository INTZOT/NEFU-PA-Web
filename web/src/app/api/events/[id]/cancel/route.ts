import { getCurrentUser } from "@/lib/session";
import { redirectTo } from "@/lib/redirect";
import { cancel } from "@/modules/event/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");

  const { id } = await params;

  const result = await cancel(user.id, id);
  if (!result.ok) {
    return redirectTo(request, `/events/${id}?error=${encodeURIComponent(result.error)}`);
  }
  const message = result.promoted
    ? "已取消报名，候补队列中最早的一位已自动递补"
    : "已取消报名";
  return redirectTo(request, `/events/${id}?ok=${encodeURIComponent(message)}`);
}
