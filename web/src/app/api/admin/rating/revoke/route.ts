import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { revokeLastSeasonMatch } from "@/modules/rating/service";
import { record } from "@/modules/audit/service";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");
  if (!isAdmin(user)) return redirectTo(request, "/me");

  const result = await revokeLastSeasonMatch(user.id);
  if (!result.ok) {
    return redirectTo(request, `/admin/rating?error=${encodeURIComponent(result.error)}`);
  }

  // 撤销同样留痕（D-30）
  await record(user, "rating.revoke", result.revokedSummary);

  return redirectTo(
    request,
    `/admin/rating?ok=${encodeURIComponent(`已撤销：${result.revokedSummary}`)}`,
  );
}
