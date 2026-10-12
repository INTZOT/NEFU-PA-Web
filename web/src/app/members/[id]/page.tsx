import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { getPublicMember } from "@/modules/profile/service";
import { getActiveSeason } from "@/modules/rating/leaderboard";

const ROLE_LABEL: Record<string, string> = {
  member: "成员",
  admin: "管理员",
  super_admin: "超级管理员",
};

const TIERS = [
  { max: 200, label: "小白" },
  { max: 400, label: "新手" },
  { max: 600, label: "熟手" },
  { max: 800, label: "高手" },
  { max: 1000, label: "大师" },
];

function tierOf(value: number): string {
  return TIERS.find((t) => value <= t.max)?.label ?? "大师";
}

/**
 * 成员主页。
 *
 * 展示范围由 D-36 约束，**字段白名单**见 modules/profile/service.ts：
 *   ✅ 姓名、角色、个人简介、自评分、比赛积分与排名
 *   ❌ 学号（R-53 禁止）、QQ 号（公开会让机器人账号被骚扰）
 *   ❌ 行程类信息（我报名的活动、我发起的约球）—— 公开等于暴露行踪
 *
 * 必须登录：R-53 是「成员**之间**可见」，游客不应看到成员信息。
 */
export default async function MemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  const { id } = await params;
  const season = await getActiveSeason();
  const member = await getPublicMember(id, season?.id ?? null);
  if (!member) notFound();

  const isSelf = viewer.id === member.id;
  const matches = (member.wins ?? 0) + (member.losses ?? 0);
  const winRate =
    matches > 0 && member.wins !== null
      ? Math.round((member.wins / matches) * 100)
      : null;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{member.name}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {ROLE_LABEL[member.role] ?? member.role}
            </p>
          </div>
          {isSelf ? (
            <Link href="/me" className="shrink-0 text-sm text-brand hover:underline">
              编辑我的主页 →
            </Link>
          ) : null}
        </div>

        {member.bio ? (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">
            {member.bio}
          </p>
        ) : (
          <p className="mt-3 text-sm text-ink-subtle">
            这位成员还没有填写个人简介。
          </p>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">水平自评</h2>
        <p className="mt-3 text-2xl font-bold tabular-nums">
          {member.selfRating}
          <span className="ml-2 text-sm font-normal text-ink-muted">
            {tierOf(member.selfRating)}
          </span>
        </p>
        <p className="mt-2 text-xs text-ink-muted">
          本人对自己水平的评估（0–1000），约球时供参考，不随比赛结果变化。
        </p>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">比赛积分</h2>
        {season ? (
          member.rating !== null ? (
            <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <div>
                <span className="text-xs text-ink-muted">积分</span>
                <p className="text-2xl font-bold tabular-nums">{member.rating}</p>
              </div>
              <div>
                <span className="text-xs text-ink-muted">排名</span>
                <p className="text-2xl font-bold tabular-nums">
                  {member.rank ?? "—"}
                  {member.totalRated > 0 ? (
                    <span className="text-sm font-normal text-ink-subtle">
                      {" / "}{member.totalRated}
                    </span>
                  ) : null}
                </p>
              </div>
              <div>
                <span className="text-xs text-ink-muted">战绩</span>
                <p className="text-2xl font-bold tabular-nums">
                  {member.wins ?? 0}
                  <span className="text-sm font-normal text-ink-subtle"> 胜 </span>
                  {member.losses ?? 0}
                  <span className="text-sm font-normal text-ink-subtle"> 负</span>
                </p>
              </div>
              {winRate !== null ? (
                <div>
                  <span className="text-xs text-ink-muted">胜率</span>
                  <p className="text-2xl font-bold tabular-nums">{winRate}%</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">
              本赛季还没有比赛记录，初始积分为 500。
            </p>
          )
        ) : (
          <p className="mt-2 text-sm text-ink-muted">当前没有进行中的赛季。</p>
        )}
        <p className="mt-3 text-xs text-ink-muted">
          积分只由官方比赛产生，按标准 ELO 结算。
          <Link href="/leaderboard" className="ml-1 text-brand hover:underline">
            查看排行榜 →
          </Link>
        </p>
      </section>

      <p className="text-xs text-ink-subtle">
        出于隐私考虑，这里不展示学号、QQ 号，也不展示对方的报名与约球记录。
      </p>
    </div>
  );
}
