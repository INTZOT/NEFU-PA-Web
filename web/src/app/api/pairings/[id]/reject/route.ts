import { getCurrentUser } from "@/lib/session";
import { redirectTo } from "@/lib/redirect";
import { rejectPairing } from "@/modules/event/pairing";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");

  const { id } = await params;
  const result = await rejectPairing(id, user.id);
  if (!result.ok) {
    return redirectTo(request, `/me?error=${encodeURIComponent(result.error)}`);
  }

  return redirectTo(request, `/me?ok=${encodeURIComponent("已拒绝该搭档邀请")}`);
}
