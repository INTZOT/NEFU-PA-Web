import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { createEvent, parseEventInput } from "@/modules/event/service";
import { record } from "@/modules/audit/service";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");
  if (!isAdmin(user)) return redirectTo(request, "/me");

  const form = await request.formData();
  const parsed = parseEventInput({
    title: String(form.get("title") ?? ""),
    description: String(form.get("description") ?? ""),
    startAt: String(form.get("startAt") ?? ""),
    location: String(form.get("location") ?? ""),
    format: String(form.get("format") ?? ""),
    capacity: String(form.get("capacity") ?? ""),
    registrationDeadline: String(form.get("registrationDeadline") ?? ""),
    status: String(form.get("status") ?? ""),
  });

  if (!parsed.ok) {
    return redirectTo(request, `/admin/events/new?error=${encodeURIComponent(parsed.error)}`);
  }

  await createEvent(parsed.value, user.id);
  await record(user, "event.create", parsed.value.title);

  return redirectTo(request, `/admin/events?ok=${encodeURIComponent("活动已发布")}`);
}
