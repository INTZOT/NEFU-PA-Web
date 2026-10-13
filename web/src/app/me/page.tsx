import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import { listPendingForUser } from "@/modules/event/pairing";
import { listMine as listMyEvents } from "@/modules/event/service";
import { listMine as listMyRooms } from "@/modules/room/service";
import { getActiveSeason, getMyRank, getHidden } from "@/modules/rating/leaderboard";
import { BIO_MAX } from "@/modules/profile/service";
import { Notice } from "@/components/Notice";
import { SelfRatingSlider } from "@/components/SelfRatingSlider";
import { MemberLink } from "@/components/MemberLink";
import { unreadCount } from "@/modules/notification/service";

const ROLE_LABEL: Record<string, string> = {
  member: "成员",
  admin: "管理员",
  super_admin: "超级管理员",
};

/** 我的报名状态 → 显示文案与配色。 */
const REG_STATUS: Record<string, { label: string; tone: string }> = {
  registered: { label: "已报名", tone: "text-brand-ink bg-brand-soft" },
  waitlisted: { label: "候补中", tone: "text-warn bg-warn-soft" },
  attended: { label: "已参加", tone: "text-ok bg-ok-soft" },
  absent: { label: "未到场", tone: "text-danger bg-danger-soft" },
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; error?: string; saved?: string; ok?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { welcome, error, saved, ok } = await searchParams;

  const season = await getActiveSeason();

  const [invites, myEvents, rooms, bioRow, unread] = await Promise.all([
    listPendingForUser(user.id),
    listMyEvents(user.id),
    listMyRooms(user.id),
    queryOne<{ bio: string | null }>("SELECT bio FROM users WHERE id = $1", [user.id]),
    // 消息入口的未读数（与导航栏红点同一个来源）
    unreadCount(user.id),
  ]);

  // 本赛季积分、战绩与排名（D-22：比赛积分与自评分是两个独立的量）
  const rating = season
    ? await queryOne<{ rating: number; wins: number; losses: number }>(
        `SELECT rating, wins, losses FROM season_ratings
          WHERE season_id = $1 AND user_id = $2`,
        [season.id, user.id],
      )
    : null;

  const rank = season ? await getMyRank(season.id, user.id) : null;
  // 是否已退出排行榜（D-39）
  const hidden = season ? await getHidden(season.id, user.id) : false;

  // ⚠️ 总人数必须与榜单用**同一套过滤条件**（排除已退出者），
  // 否则会出现「我第 3 / 共 5 人」而榜单上只有 4 人这种自相矛盾的显示。
  const totalRated = season
    ? await queryOne<{ n: string }>(
        `SELECT count(*)::text AS n FROM season_ratings
          WHERE season_id = $1 AND NOT leaderboard_hidden`,
        [season.id],
      )
    : null;

  const matches = rating ? rating.wins + rating.losses : 0;
  const winRate = matches > 0 && rating ? Math.round((rating.wins / matches) * 100) : null;
  const total = totalRated ? Number(totalRated.n) : 0;

  // ---- 待办：把「等着我做 / 等着别人做」的事集中到一处 ----
  const now = Date.now();
  const upcoming = myEvents
    .filter((e) => new Date(e.startAt).getTime() > now && e.status !== "waitlisted")
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    .slice(0, 3);
  const roomsAwaitingMe = rooms.initiated.filter((r) => r.status === "open" && r.pendingCount > 0);
  const todoCount = invites.length + upcoming.length + roomsAwaitingMe.length;

  return (
    <div className="space-y-6">
      {welcome ? (
        <p className="rounded-lg border border-ok/25 bg-ok-soft px-3 py-2 text-sm text-ok">
          注册成功，欢迎加入协会！下面可以确认一下你的自评分。
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-lg border border-ok/25 bg-ok-soft px-3 py-2 text-sm text-ok">
          自评分已更新。
        </p>
      ) : null}
      <Notice ok={ok} error={error} />

      {/* ---- 待办：有事情等你做时才出现，避免常态占用版面 ---- */}
      {todoCount > 0 ? (
        <section className="space-y-3 rounded-xl border border-warn/25 bg-warn-soft p-4">
          <h2 className="font-semibold text-warn">待你处理（{todoCount}）</h2>

          {invites.map((inv) => (
            <div key={inv.pairingId} className="space-y-2 rounded-lg bg-surface p-3 text-sm">
              <p>
                <span className="font-medium">双打搭档邀请</span>
                <span className="ml-2 text-ink-muted">
                  {inv.proposedBy === "admin" ? "管理员指派：" : ""}
                </span>
                <MemberLink userId={inv.partnerId} name={inv.partnerName} />
              </p>
              <p className="text-xs text-ink-muted">
                活动：
                <Link href={`/events/${inv.eventId}`} className="text-brand hover:underline">
                  {inv.eventTitle}
                </Link>
              </p>
              <div className="flex items-center gap-2">
                <form action={`/api/pairings/${inv.pairingId}/accept`} method="post">
                  <button
                    type="submit"
                    className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-strong"
                  >
                    接受
                  </button>
                </form>
                <form action={`/api/pairings/${inv.pairingId}/reject`} method="post">
                  <button
                    type="submit"
                    className="rounded-lg border border-line-strong px-3 py-1.5 text-xs text-ink transition hover:border-ink-muted"
                  >
                    拒绝
                  </button>
                </form>
              </div>
            </div>
          ))}

          {upcoming.map((e) => (
            <div key={e.eventId} className="rounded-lg bg-surface p-3 text-sm">
              <p>
                <span className="font-medium">即将参加</span>
                <span className="ml-2 text-ink-muted">{formatDate(e.startAt)}</span>
              </p>
              <p className="mt-1 text-xs">
                <Link href={`/events/${e.eventId}`} className="text-brand hover:underline">
                  {e.eventTitle}
                </Link>
                {e.location ? <span className="ml-2 text-ink-muted">{e.location}</span> : null}
              </p>
            </div>
          ))}

          {roomsAwaitingMe.map((r) => (
            <div key={r.id} className="rounded-lg bg-surface p-3 text-sm">
              <p>
                <span className="font-medium">约球申请待处理</span>
                <span className="ml-2 text-ink-muted">{r.pendingCount} 人</span>
              </p>
              <p className="mt-1 text-xs">
                <Link href={`/rooms/${r.id}`} className="text-brand hover:underline">
                  {r.timeSlot} · 去处理 →
                </Link>
              </p>
            </div>
          ))}
        </section>
      ) : null}

      {/* ---- 身份 ---- */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{user.name}</h1>
            <p className="mt-1 text-sm text-ink-muted">{ROLE_LABEL[user.role] ?? user.role}</p>
          </div>

          {/*
           * 消息入口放在个人主页里（而非导航栏单开一项）。
           * 导航栏那个红点在名字旁，两者指向同一处 ——
           * 头像名旁的星点负责「提醒」，这里负责「找到」。
           */}
          <Link
            href="/notifications"
            className={[
              "flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition",
              unread > 0
                ? "border-danger/30 bg-danger-soft text-danger hover:border-danger/50"
                : "border-line text-ink-muted hover:bg-surface-muted hover:text-ink",
            ].join(" ")}
          >
            消息
            {unread > 0 ? (
              <span className="rounded-full bg-danger px-1.5 text-xs font-medium text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Link>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-ink-muted">QQ 号</dt>
          <dd>{user.qqNumber}</dd>
          <dt className="text-ink-muted">学号</dt>
          <dd>
            {user.studentId}
            <span className="ml-2 text-xs text-ink-subtle">仅登录用，不对他人展示（R-53）</span>
          </dd>
        </dl>
      </section>

      {/* ---- 个人简介 ---- */}
      <section id="bio" className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">个人简介</h2>
        <p className="mt-1 text-sm text-ink-muted">
          一句话介绍自己，比如球龄、擅长的位置。上限 {BIO_MAX} 字。
          约球和配对时，别人据此了解你的水平。留空则不显示。
        </p>

        <form action="/api/me/bio" method="post" className="mt-3 space-y-3">
          <textarea
            name="bio"
            rows={2}
            maxLength={BIO_MAX}
            defaultValue={bioRow?.bio ?? ""}
            placeholder="例：打了两年，主要打后场，周末基本都在"
            className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
          >
            保存简介
          </button>
        </form>
      </section>

      {/* ---- 比赛积分 ---- */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">比赛积分</h2>
        {season ? (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <div>
                <span className="text-xs text-ink-muted">积分</span>
                <p className="text-2xl font-bold tabular-nums">{rating?.rating ?? 500}</p>
              </div>
              <div>
                <span className="text-xs text-ink-muted">排名</span>
                <p className="text-2xl font-bold tabular-nums">
                  {hidden ? (
                    <span className="text-base font-normal text-ink-subtle">已退出</span>
                  ) : (
                    <>
                      {rank ?? "—"}
                      {rank && total > 0 ? (
                        <span className="text-sm font-normal text-ink-subtle"> / {total}</span>
                      ) : null}
                    </>
                  )}
                </p>
              </div>
              <div>
                <span className="text-xs text-ink-muted">战绩</span>
                <p className="text-2xl font-bold tabular-nums">
                  {rating?.wins ?? 0}
                  <span className="text-sm font-normal text-ink-subtle"> 胜 </span>
                  {rating?.losses ?? 0}
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

            <p className="text-xs text-ink-muted">
              赛季 {season.name}。
              <Link href="/leaderboard" className="text-brand hover:underline">
                查看完整排行榜 →
              </Link>
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

        {/* ---- 是否参与排行（D-39）---- */}
        {season ? (
          <div id="leaderboard" className="mt-4 rounded-lg border border-line bg-canvas p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  参与排行榜：
                  <span className={hidden ? "text-ink-muted" : "text-ok"}>
                    {hidden ? "已关闭" : "已开启"}
                  </span>
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  关闭后你<strong>暂时不显示在排行榜上</strong>，可随时恢复。
                  <br />
                  比赛积分与战绩<strong>照常累积</strong>
                  ，也不影响你参加比赛和其他人对你的积分结算。
                </p>
              </div>
              <form action="/api/me/leaderboard" method="post">
                <input type="hidden" name="hidden" value={hidden ? "0" : "1"} />
                <button
                  type="submit"
                  className="rounded-lg border border-line-strong px-3 py-1.5 text-sm transition hover:border-brand hover:text-brand"
                >
                  {hidden ? "恢复参与排行" : "退出排行榜"}
                </button>
              </form>
            </div>
          </div>
        ) : null}
      </section>

      {/* ---- 个人自评分 ---- */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">个人自评分</h2>
        <p className="mt-1 text-sm text-ink-muted">
          这是你对自己水平的评估，用于约球时供他人参考。它不随比赛结果变化，可随时修改。
        </p>
        <SelfRatingSlider initial={user.selfRating} />
      </section>

      {/* ---- 我报名的活动 ---- */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">我报名的活动</h2>
        {myEvents.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            还没有报名任何活动。
            <Link href="/events" className="ml-1 text-brand hover:underline">
              去看看 →
            </Link>
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {myEvents.slice(0, 8).map((e) => {
              const meta = REG_STATUS[e.status] ?? REG_STATUS.registered;
              return (
                <li key={e.eventId} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <Link
                      href={`/events/${e.eventId}`}
                      className="font-medium text-ink hover:text-brand hover:underline"
                    >
                      {e.eventTitle}
                    </Link>
                    <p className="text-xs text-ink-subtle">
                      {formatDate(e.startAt)}
                      {e.location ? ` · ${e.location}` : ""}
                      {e.waitlistPosition ? ` · 候补第 ${e.waitlistPosition} 位` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${meta.tone}`}>
                    {meta.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---- 我的约球 ---- */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">我的约球</h2>
          <Link href="/rooms/mine" className="text-sm text-brand hover:underline">
            全部 →
          </Link>
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          我发起的 {rooms.initiated.length} 个 · 我加入的 {rooms.joined.length} 个
        </p>
      </section>

      {/* ---- 账号凭据 ---- */}
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
                className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 outline-none focus:border-brand"
              />
            </label>
            <label className="text-sm">
              <span className="text-ink-muted">学号</span>
              <input
                name="studentId"
                defaultValue={user.studentId}
                required
                pattern="\\d{10}"
                className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 outline-none focus:border-brand"
              />
            </label>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
          >
            保存凭据
          </button>
          <p className="text-xs text-ink-muted">
            ⚠️ 换绑后，<strong>用旧 QQ 号将无法再登录</strong>。
            积分、约球等历史数据跟随账号，不受影响。
          </p>
        </form>
      </section>

      <form action="/api/auth/logout" method="post">
        <button type="submit" className="text-sm text-ink-muted transition hover:text-ink">
          退出登录
        </button>
      </form>
    </div>
  );
}
