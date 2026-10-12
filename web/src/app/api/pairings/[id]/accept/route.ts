import { getCurrentUser } from "@/lib/session";
import { redirectTo } from "@/lib/redirect";
import { acceptPairing } from "@/modules/event/pairing";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");

  const { id } = await params;
  const result = await acceptPairing(id, user.id);
  if (!result.ok) {
    return redirectTo(request, `/me?error=${encodeURIComponent(result.error)}`);
  }

  const promoted = "promoted" in result ? result.promoted : null;
  const message = promoted
    ? "已确认搭档。你俩合占一个名额，空出的名额已自动递给候补"
    : "已确认搭档";
  return redirectTo(request, `/me?ok=${encodeURIComponent(message)}`);
}
