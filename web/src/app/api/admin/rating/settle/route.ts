import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { settle } from "@/modules/rating/service";
import { record } from "@/modules/audit/service";
import { getById } from "@/modules/event/service";

/**
 * 录入并结算一场官方比赛。
 *
 * 输入用多选控件给出 user_id 列表（sideA / sideB），人数校验在 service.settle 里。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");
  if (!isAdmin(user)) return redirectTo(request, "/me");

  const form = await request.formData();
  const back = "/admin/rating/record";

  const eventId = String(form.get("eventId") ?? "");
  const format = String(form.get("format") ?? "");
  const winner = String(form.get("winner") ?? "");
  const sideA = form.getAll("sideA").map(String).filter(Boolean);
  const sideB = form.getAll("sideB").map(String).filter(Boolean);

  if (!eventId) {
    return redirectTo(request, `${back}?error=${encodeURIComponent("请选择赛事")}`);
  }
  if (format !== "singles" && format !== "doubles") {
    return redirectTo(request, `${back}?error=${encodeURIComponent("请选择赛制")}`);
  }
  if (winner !== "a" && winner !== "b") {
    return redirectTo(request, `${back}?error=${encodeURIComponent("请选择胜方")}`);
  }

  const result = await settle({ eventId, format, sideA, sideB, winner }, user.id);
  if (!result.ok) {
    return redirectTo(request, `${back}?error=${encodeURIComponent(result.error)}`);
  }

  const event = await getById(eventId);
  const summary = result.deltas
    .map((d) => `${d.delta > 0 ? "+" : ""}${d.delta}`)
    .join("/");
  await record(user, "rating.settle", `${event?.title ?? eventId}（${summary}）`);

  const detail = result.deltas
    .map((d) => `${d.userId.slice(0, 8)}… ${d.delta > 0 ? "+" : ""}${d.delta} → ${d.ratingAfter}`)
    .join("；");
  return redirectTo(
    request,
    `/admin/rating?ok=${encodeURIComponent(`已结算：${detail}`)}`,
  );
}
