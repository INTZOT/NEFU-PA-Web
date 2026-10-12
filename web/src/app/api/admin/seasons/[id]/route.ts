import { getCurrentUser } from "@/lib/session";
import { isSuperAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { updateDates, parseSeasonInput, getById } from "@/modules/rating/season";
import { record } from "@/modules/audit/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");
  if (!isSuperAdmin(user)) return redirectTo(request, "/admin");

  const { id } = await params;
  const existing = await getById(id);
  if (!existing) {
    return redirectTo(request, `/admin/seasons?error=${encodeURIComponent("赛季不存在")}`);
  }

  // 复用同一套校验：名字从库里取（不允许改名）
  const form = await request.formData();
  const parsed = parseSeasonInput({
    name: existing.name,
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

  await updateDates(id, parsed.value);
  await record(user, "season.update", `${existing.name} 日期校正`);

  return redirectTo(
    request,
    `/admin/seasons?ok=${encodeURIComponent(`${existing.name} 的日期已保存`)}`,
  );
}
