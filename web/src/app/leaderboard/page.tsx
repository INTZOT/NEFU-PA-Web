import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listSeasons, getActiveSeason, getLeaderboard, PAGE_SIZE } from "@/modules/rating/leaderboard";
import { archiveDue } from "@/modules/rating/season";

export const metadata = { title: "积分排行 · 东北林业大学匹克球社团" };

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; page?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  // R-29：排行榜仅成员可见
  if (!user) redirect("/login");

  const { season: seasonParam, page: pageParam, q } = await searchParams;

  // 惰性归档：学年已结束的赛季自动转归档（D-25）
  await archiveDue();

  const seasons = await listSeasons();
  const active = await getActiveSeason();
  const selected = seasons.find((s) => s.id === seasonParam) ?? active ?? seasons[0] ?? null;

  if (!selected) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">积分排行</h1>
        <p className="rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
          还没有赛季。管理员配置赛季起止日期后，这里会显示排行。
        </p>
      </div>
    );
  }

  const page = Math.max(1, Number(pageParam) || 1);
  const { rows, total, pageCount } = await getLeaderboard(selected.id, { page, search: q });

  const buildQuery = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { season: selected.id, q, page: String(page), ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    return `/leaderboard?${p.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">积分排行</h1>
          <p className="mt-1 text-sm text-neutral-500">
            只统计官方比赛产生的积分（标准 ELO，K=40，零和）。个人自评分不在榜上。
          </p>
        </div>
        {seasons.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {seasons.map((s) => (
              <Link
                key={s.id}
                href={buildQuery({ season: s.id, page: "1" })}
                className={
                  s.id === selected.id
                    ? "rounded bg-neutral-900 px-3 py-1 text-white"
                    : "rounded border border-neutral-300 px-3 py-1 text-neutral-600 hover:text-neutral-900"
                }
              >
                {s.name}
                {s.status === "active" ? "（进行中）" : ""}
              </Link>
            ))}
          </div>
        ) : (
          <span className="text-sm text-neutral-500">赛季 {selected.name}</span>
        )}
      </div>

      <form action="/leaderboard" method="get" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="season" value={selected.id} />
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="按姓名或学号搜索"
          className="rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <button type="submit" className="rounded border border-neutral-300 px-3 py-2 text-sm">
          搜索
        </button>
        {q ? (
          <Link href={buildQuery({ q: undefined, page: "1" })} className="text-sm text-neutral-500">
            清除
          </Link>
        ) : null}
        <span className="ml-auto text-xs text-neutral-400">共 {total} 人</span>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
          {q ? "没有匹配的成员。" : "本赛季还没有人获得积分。"}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">名次</th>
                <th className="px-3 py-2 font-medium">姓名</th>
                <th className="px-3 py-2 text-right font-medium">积分</th>
                <th className="px-3 py-2 text-right font-medium">场次</th>
                <th className="px-3 py-2 text-right font-medium">胜率</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.userId}
                  className={r.userId === user.id ? "border-t border-neutral-100 bg-amber-50" : "border-t border-neutral-100"}
                >
                  <td className="px-3 py-2 text-neutral-500">{r.rank}</td>
                  <td className="px-3 py-2">
                    {r.name}
                    {r.userId === user.id ? (
                      <span className="ml-2 text-xs text-amber-700">（我）</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{r.rating}</td>
                  <td className="px-3 py-2 text-right text-neutral-500">{r.matches}</td>
                  <td className="px-3 py-2 text-right text-neutral-500">
                    {r.winRate === null ? "—" : `${r.winRate}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 ? (
        <div className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link href={buildQuery({ page: String(page - 1) })} className="text-blue-600 hover:underline">
              ← 上一页
            </Link>
          ) : null}
          <span className="text-neutral-500">
            第 {page} / {pageCount} 页（每页 {PAGE_SIZE} 人）
          </span>
          {page < pageCount ? (
            <Link href={buildQuery({ page: String(page + 1) })} className="text-blue-600 hover:underline">
              下一页 →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
