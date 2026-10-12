import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getById, isRegistrationOpen, canCancel, CANCEL_HOURS_BEFORE } from "@/modules/event/service";
import { getPartner } from "@/modules/event/pairing";
import { queryOne } from "@/lib/db";
import { Notice } from "@/components/Notice";

function formatTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { ok, error } = await searchParams;

  const event = await getById(id);
  // 草稿不公开
  if (!event || event.status === "draft") notFound();

  const user = await getCurrentUser();

  // 我在这场比赛里的报名状态
  const mine = user
    ? await queryOne<{ status: string }>(
        "SELECT status FROM event_registrations WHERE event_id = $1 AND user_id = $2",
        [id, user.id],
      )
    : null;

  const open = isRegistrationOpen(event);
  const cancellable = canCancel(event);
  const myStatus = mine?.status ?? null;

  // 双打：我已确认的搭档（D-20 双向确认）
  const partner =
    user && event.format === "doubles" ? await getPartner(id, user.id) : null;

  return (
    <div className="space-y-5">
      <Link href="/events" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← 社团活动
      </Link>

      <Notice ok={ok} error={error} />

      <article className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
            {event.format === "doubles" ? "双打" : "单打"}
          </span>
        </div>

        <h1 className="mt-2 text-xl font-bold">{event.title}</h1>

        <dl className="mt-3 grid gap-y-2 text-sm sm:grid-cols-2">
          <dt className="text-neutral-500">开始时间</dt>
          <dd>{formatTime(event.startAt)}</dd>
          {event.location ? (
            <>
              <dt className="text-neutral-500">地点</dt>
              <dd>{event.location}</dd>
            </>
          ) : null}
          <dt className="text-neutral-500">名额</dt>
          <dd>
            {event.capacity} {event.capacityUnit === "teams" ? "队" : "人"}
            {event.remaining > 0 ? `（还剩 ${event.remaining}）` : "（已满）"}
            {event.waitlistCount > 0 ? ` · 候补 ${event.waitlistCount} 人` : ""}
          </dd>
          {event.registrationDeadline ? (
            <>
              <dt className="text-neutral-500">报名截止</dt>
              <dd>{formatTime(event.registrationDeadline)}</dd>
            </>
          ) : null}
        </dl>

        {event.description ? (
          <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap text-neutral-700">
            {event.description}
          </p>
        ) : null}
      </article>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        {!user ? (
          <p className="text-sm text-neutral-600">
            报名需要登录。
            <Link href="/login" className="ml-1 text-blue-600 hover:underline">
              去登录 →
            </Link>
          </p>
        ) : myStatus === "registered" ? (
          <div className="space-y-2">
            <p className="text-sm text-green-700">你已经报名成功。</p>

            {event.format === "doubles" ? (
              partner ? (
                <p className="text-sm text-neutral-700">
                  搭档：<span className="font-medium">{partner.partnerName}</span>
                  <span className="ml-2 text-xs text-neutral-500">（已确认，你俩合占一个名额）</span>
                </p>
              ) : (
                <div className="rounded border border-neutral-200 bg-neutral-50 p-3">
                  <p className="text-sm text-neutral-700">还没有搭档。</p>
                  <form
                    action={`/api/events/${event.id}/partner`}
                    method="post"
                    className="mt-2 flex flex-wrap items-center gap-2"
                  >
                    <input
                      name="partnerIdent"
                      required
                      placeholder="搭档的 QQ 号或学号"
                      className="rounded border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-900"
                    />
                    <button
                      type="submit"
                      className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
                    >
                      邀请搭档
                    </button>
                  </form>
                  <p className="mt-1 text-xs text-neutral-500">
                    对方也需要先报名这个赛事，邀请发出后由对方在个人主页确认。
                  </p>
                </div>
              )
            ) : null}
            {cancellable ? (
              <form action={`/api/events/${event.id}/cancel`} method="post">
                <button type="submit" className="text-sm text-red-600 hover:text-red-800">
                  取消报名
                </button>
              </form>
            ) : (
              <p className="text-xs text-neutral-500">
                已过取消截止时间（赛前 {CANCEL_HOURS_BEFORE} 小时）。
              </p>
            )}
          </div>
        ) : myStatus === "waitlisted" ? (
          <div className="space-y-2">
            <p className="text-sm text-amber-700">名额已满，你在候补队列中。</p>
            <p className="text-xs text-neutral-500">
              有人取消时会自动递补，无需操作。
            </p>
            {cancellable ? (
              <form action={`/api/events/${event.id}/cancel`} method="post">
                <button type="submit" className="text-sm text-red-600 hover:text-red-800">
                  退出候补
                </button>
              </form>
            ) : null}
          </div>
        ) : open ? (
          <form action={`/api/events/${event.id}/register`} method="post">
            <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-sm text-white">
              {event.remaining > 0 ? "报名" : "名额已满，加入候补"}
            </button>
          </form>
        ) : (
          <p className="text-sm text-neutral-500">报名已截止。</p>
        )}
      </section>
    </div>
  );
}
