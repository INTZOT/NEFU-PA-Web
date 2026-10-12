import { getCurrentUser } from "@/lib/session";
import { redirectTo } from "@/lib/redirect";
import { withdraw } from "@/modules/room/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");

  const { id } = await params;
  const result = await withdraw(id, user.id);
  if (!result.ok) {
    return redirectTo(request, `/rooms/${id}?error=${encodeURIComponent(result.error)}`);
  }
  // 退出即恢复空位（D-10 的 full → open）
  return redirectTo(request, `/rooms/${id}?ok=${encodeURIComponent("已退出，空位已恢复")}`);
}
