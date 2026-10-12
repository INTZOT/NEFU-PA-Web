import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { queryOne } from "@/lib/db";
import { listPendingForUser } from "@/modules/event/pairing";
import { Notice } from "@/components/Notice";
import { SelfRatingSlider } from "@/components/SelfRatingSlider";

// 五档话术已移入 SelfRatingSlider —— 它只在「选择自评分」时出现，
// 页面其余位置不跟随展示（D-21）。

const ROLE_LABEL: Record<string, string> = {
  member: "成员",
  admin: "管理员",
  super_admin: "超级管理员",
};

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; error?: string; saved?: string; ok?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { welcome, error, saved, ok } = await searchParams;

  // 待我表态的双打搭档邀请（D-20 的双向确认）
  const invites = await listPendingForUser(user.id);

  // 本赛季的比赛积分（D-22：与自评分是两个独立的量）
  const season = await queryOne<{ name: string; rating: number; wins: number; losses: number }>(
    `SELECT s.name, r.rating, r.wins, r.losses
       FROM season_ratings r
       JOIN seasons s ON s.id = r.season_id
      WHERE r.user_id = $1 AND s.status = 'active'
      LIMIT 1`,
    [user.id],
  );

  return (
    <div className="space-y-6">
      {welcome ? (
        <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          注册成功，欢迎加入社团！下面可以确认一下你的自评分。
        </p>
      ) : null}
      {saved ? (
        <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          自评分已更新。
        </p>
      ) : null}
      <Notice ok={ok} error={error} />

      {invites.length > 0 ? (
        <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">待你确认的双打搭档</h2>
          {invites.map((inv) => (
            <div key={inv.pairingId} className="space-y-2 text-sm">
              <p className="text-amber-900">
                <Link href={`/events/${inv.eventId}`} className="font-medium hover:underline">
                  {inv.eventTitle}
                </Link>
                <span className="ml-2">
                  {inv.proposedBy === "admin" ? "管理员指派" : ""} 搭档：{inv.partnerName}
                </span>
              </p>
              <div className="flex items-center gap-3">
                <form action={`/api/pairings/${inv.pairingId}/accept`} method="post">
                  <button
                    type="submit"
                    className="rounded bg-brand px-3 py-1.5 text-sm text-white"
                  >
                    同意
                  </button>
                </form>
                <form action={`/api/pairings/${inv.pairingId}/reject`} method="post">
                  <button
                    type="submit"
                    className="text-sm text-ink-muted hover:text-ink"
                  >
                    拒绝
                  </button>
                </form>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="rounded-xl border border-line bg-surface p-4">
        <h1 className="text-xl font-bold">{user.name}</h1>
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-ink-muted">角色</dt>
          <dd>{ROLE_LABEL[user.role] ?? user.role}</dd>
          <dt className="text-ink-muted">学号</dt>
          <dd>
            {user.studentId}
            <span className="ml-2 text-xs text-ink-subtle">
              登录用；不对其他成员展示（R-53）
            </span>
          </dd>
        </dl>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">比赛积分</h2>
        {season ? (
          <div className="mt-2 space-y-1 text-sm">
            <p>
              本赛季（{season.name}）：
              <span className="text-lg font-bold">{season.rating}</span>
            </p>
            <p className="text-ink-muted">
              战绩 {season.wins} 胜 {season.losses} 负
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">
            当前没有进行中的赛季。管理员配置赛季起止日期后，此处会显示你的比赛积分。
          </p>
        )}
        <p className="mt-3 text-xs text-ink-muted">
          比赛积分只由官方比赛产生，按标准 ELO 结算（K=40），按学年归档。
        </p>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">个人自评分</h2>
        <p className="mt-1 text-sm text-ink-muted">
          这是你对自己水平的评估，用于约球时供他人参考。它不随比赛结果变化，可随时修改。
        </p>

        <SelfRatingSlider initial={user.selfRating} />
      </section>

      <section id="credentials" className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">账号凭据</h2>
        <p className="mt-1 text-sm text-ink-muted">
          登录用的 QQ 号与学号可以自行修改，无需管理员审批（D-11）。
          改完立即生效，下次登录请用新的。
        </p>

        <form action="/api/me/credentials" method="post" className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-ink-muted">QQ 号</span>
              <input
                name="qqNumber"
                defaultValue={user.qqNumber}
                required
                pattern="\\d{5,12}"
                className="mt-1 w-full rounded border border-line-strong px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="text-ink-muted">学号</span>
              <input
                name="studentId"
                defaultValue={user.studentId}
                required
                pattern="\\d{10}"
                className="mt-1 w-full rounded border border-line-strong px-3 py-2"
              />
            </label>
          </div>
          <button type="submit" className="rounded bg-brand px-4 py-2 text-sm text-white">
            保存凭据
          </button>
          <p className="text-xs text-ink-muted">
            ⚠️ 换绑后，<strong>用旧 QQ 号将无法再登录</strong>。
            积分、约球等历史数据跟随账号，不受影响。
          </p>
        </form>
      </section>

      <form action="/api/auth/logout" method="post">
        <button type="submit" className="text-sm text-ink-muted hover:text-ink">
          退出登录
        </button>
      </form>
    </div>
  );
}