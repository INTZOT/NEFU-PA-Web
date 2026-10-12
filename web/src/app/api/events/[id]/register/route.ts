import { getCurrentUser } from "@/lib/session";
import { redirectTo } from "@/lib/redirect";
import { register } from "@/modules/event/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");

  const { id } = await params;

  const result = await register(user.id, id);
  if (!result.ok) {
    return redirectTo(request, `/events/${id}?error=${encodeURIComponent(result.error)}`);
  }
  const message =
    result.status === "waitlisted" ? "名额已满，你已进入候补队列" : "报名成功";
  return redirectTo(request, `/events/${id}?ok=${encodeURIComponent(message)}`);
}
