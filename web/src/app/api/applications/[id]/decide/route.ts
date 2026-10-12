import { getCurrentUser } from "@/lib/session";
import { redirectTo } from "@/lib/redirect";
import { decide } from "@/modules/room/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");

  const { id } = await params;
  const form = await request.formData();
  const approve = String(form.get("decision") ?? "") === "approve";

  const result = await decide(id, user.id, approve);
  // 跳回房间页：roomId 由服务端从申请记录里带出，不依赖表单传值
  const roomId = result.ok ? result.roomId : String(form.get("roomId") ?? "");
  const back = roomId ? `/rooms/${roomId}` : "/rooms/mine";
  if (!result.ok) {
    return redirectTo(request, `${back}?error=${encodeURIComponent(result.error)}`);
  }
  return redirectTo(request, `${back}?ok=${encodeURIComponent(approve ? "已同意" : "已拒绝")}`);
}
