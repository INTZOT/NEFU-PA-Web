import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { markAbsent } from "@/modules/event/attendance";
import { record } from "@/modules/audit/service";
import { getById } from "@/modules/event/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");
  if (!isAdmin(user)) return redirectTo(request, "/me");

  const { id } = await params;
  const event = await getById(id);
  const result = await markAbsent(id);

  await record(user, "event.checkin", `${event?.title ?? id}：标记缺席 ${result.marked} 人`);

  return redirectTo(
    request,
    `/admin/events/${id}?ok=${encodeURIComponent(`已标记 ${result.marked} 人为缺席`)}`,
  );
}
