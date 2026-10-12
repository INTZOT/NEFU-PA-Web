import { getCurrentUser } from "@/lib/session";
import { redirectTo } from "@/lib/redirect";
import { createRoom, parseRoomInput } from "@/modules/room/service";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");

  const form = await request.formData();
  const parsed = parseRoomInput({
    timeSlot: String(form.get("timeSlot") ?? ""),
    capacity: String(form.get("capacity") ?? ""),
    note: String(form.get("note") ?? ""),
  });

  if (!parsed.ok) {
    return redirectTo(request, `/rooms/new?error=${encodeURIComponent(parsed.error)}`);
  }

  const id = await createRoom(parsed.value, user.id);
  return redirectTo(request, `/rooms/${id}?ok=${encodeURIComponent("约球房间已发布")}`);
}
