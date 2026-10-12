import { getCurrentUser } from "@/lib/session";
import { redirectTo } from "@/lib/redirect";
import { cancelRoom } from "@/modules/room/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");

  const { id } = await params;
  const result = await cancelRoom(id, user.id);
  if (!result.ok) {
    return redirectTo(request, `/rooms/${id}?error=${encodeURIComponent(result.error)}`);
  }
  return redirectTo(request, "/rooms/mine?ok=" + encodeURIComponent("房间已取消"));
}
