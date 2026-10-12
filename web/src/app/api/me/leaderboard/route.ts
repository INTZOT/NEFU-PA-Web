import { getCurrentUser } from "@/lib/session";
import { redirectTo } from "@/lib/redirect";
import { getActiveSeason, setHidden } from "@/modules/rating/leaderboard";

/**
 * 切换「是否参与排行」（D-39）。
 *
 * 语义：自愿**暂时**退出排行榜，可随时恢复。
 * **不影响比赛积分** —— 隐藏期间照常参赛、积分照常结算，
 * 因此对其他人完全公平（他们仍在与隐藏者对战）。
 *
 * 按赛季存储：新赛季重新计算，不会一次关闭就永久生效。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");

  const season = await getActiveSeason();
  if (!season) {
    return redirectTo(
      request,
      `/me?error=${encodeURIComponent("当前没有进行中的赛季")}#leaderboard`,
    );
  }

  const form = await request.formData();
  const hidden = String(form.get("hidden") ?? "") === "1";

  await setHidden(season.id, user.id, hidden);

  return redirectTo(
    request,
    `/me?ok=${encodeURIComponent(
      hidden ? "已退出本赛季排行榜，比赛积分照常累积" : "已恢复参与排行榜",
    )}#leaderboard`,
  );
}
