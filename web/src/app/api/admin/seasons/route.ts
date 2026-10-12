import { getCurrentUser } from "@/lib/session";
import { isSuperAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { createSeason, parseSeasonInput, archiveDue } from "@/modules/rating/season";
import { record } from "@/modules/audit/service";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");
  if (!isSuperAdmin(user)) return redirectTo(request, "/admin");

  const form = await request.formData();
  const parsed = parseSeasonInput({
    name: String(form.get("name") ?? ""),
    startDate: String(form.get("startDate") ?? ""),
    endDate: String(form.get("endDate") ?? ""),
    fallStart: String(form.get("fallStart") ?? ""),
    fallEnd: String(form.get("fallEnd") ?? ""),
    springStart: String(form.get("springStart") ?? ""),
    springEnd: String(form.get("springEnd") ?? ""),
  });

  if (!parsed.ok) {
    return redirectTo(request, `/admin/seasons?error=${encodeURIComponent(parsed.error)}`);
  }

  try {
    await createSeason(parsed.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : "新建赛季失败";
    return redirectTo(request, `/admin/seasons?error=${encodeURIComponent(message)}`);
  }

  await archiveDue();
  await record(user, "season.create", parsed.value.name);

  return redirectTo(
    request,
    `/admin/seasons?ok=${encodeURIComponent(`已开启赛季 ${parsed.value.name}`)}`,
  );
}
