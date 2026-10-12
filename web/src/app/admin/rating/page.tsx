import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canEnterAdmin } from "@/lib/roles";
import { listPublished } from "@/modules/event/service";
import { listRecentMatches } from "@/modules/rating/service";
import { getActiveSeason } from "@/modules/rating/leaderboard";
import { Notice } from "@/components/Notice";

function formatTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function RatingAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEnterAdmin(user)) redirect("/me");

  const { ok, error } = await searchParams;
  const [season, events, recent] = await Promise.all([
    getActiveSeason(),
    listPublished(),
    listRecentMatches(10),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin" className="text-sm text-ink-muted hover:text-ink">
          ← 管理后台
        </Link>
        <h1 className="mt-1 text-xl font-bold">成绩录入</h1>
        <p className="mt-1 text-sm text-ink-muted">
          录入官方比赛结果，系统按标准 ELO（K=40）自动结算，双方增减为零和。
        </p>
      </div>

      <Notice ok={ok} error={error} />

      {!season ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          当前没有进行中的赛季，无法结算积分。请先配置赛季起止日期。
        </p>
      ) : null}

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">撤销最近一场</h2>
        <p className="mt-1 text-xs text-ink-muted">
          录错时可以撤销，但只能撤最近一场 —— ELO 是链式的，撤销中间某场会让其后所有场次失去依据。
        </p>
        <form action="/api/admin/rating/revoke" method="post" className="mt-3">
          <button
            type="submit"
            className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
          >
            撤销最近一场结算
          </button>
        </form>

        {recent.length > 0 ? (
          <ul className="mt-3 space-y-1 text-xs text-ink-muted">
            {recent.slice(0, 5).map((m) => (
              <li key={m.id}>
                {formatTime(m.createdAt)} · {m.eventTitle} ·{" "}
                {m.format === "doubles" ? "双打" : "单打"} · {m.winner.toUpperCase()} 方胜 ·{" "}
                {m.participants.map((p) => `${p.name}(${p.delta > 0 ? "+" : ""}${p.delta})`).join("、")}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-ink-subtle">本赛季还没有已结算的对局。</p>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">逐场录入</h2>
            <p className="mt-1 text-xs text-ink-muted">
              选择赛事、赛制、双方成员与胜方，系统自动结算。
              当前有 {events.length} 个已发布赛事。
            </p>
          </div>
          <Link
            href="/admin/rating/record"
            className="rounded bg-brand px-4 py-2 text-sm text-white"
          >
            录入一场
          </Link>
        </div>
      </section>
    </div>
  );
}
