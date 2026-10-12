import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canEnterAdmin } from "@/lib/roles";
import { getById } from "@/modules/event/service";
import { listRoster } from "@/modules/event/attendance";
import { Notice } from "@/components/Notice";

const STATUS_LABEL: Record<string, string> = {
  registered: "已报名",
  waitlisted: "候补",
  absent: "缺席",
  cancelled: "已取消",
};

function formatTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function EventAdminDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEnterAdmin(user)) redirect("/me");

  const { id } = await params;
  const { ok, error } = await searchParams;

  const event = await getById(id);
  if (!event) notFound();

  const roster = await listRoster(id);
  const registered = roster.filter((r) => r.status === "registered" || r.status === "absent");
  const waitlisted = roster.filter((r) => r.status === "waitlisted");
  const checkedIn = roster.filter((r) => r.checkedInAt).length;

  return (
    <div className="space-y-5">
      <Link href="/admin/events" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← 活动管理
      </Link>

      <div>
        <h1 className="text-xl font-bold">{event.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {event.format === "doubles" ? "双打" : "单打"} · {formatTime(event.startAt)}
          {event.location ? ` · ${event.location}` : ""}
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          名额 {event.occupied}/{event.capacity}{" "}
          {event.capacityUnit === "teams" ? "队" : "人"}
          {event.waitlistCount > 0 ? ` · 候补 ${event.waitlistCount}` : ""}
          {` · 已签到 ${checkedIn}`}
        </p>
      </div>

      <Notice ok={ok} error={error} />

      <section className="space-y-2">
        <h2 className="font-semibold">报名名单</h2>
        <p className="text-xs text-neutral-500">
          签到由管理员在现场勾选（D-20）。活动结束后可点「标记缺席」，
          把报名但没到的人记为缺席 —— 无积分后果，但会影响其后续候补优先级（D-28）。
        </p>

        {registered.length === 0 ? (
          <p className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
            还没有人报名。
          </p>
        ) : (
          <ul className="space-y-2">
            {registered.map((r) => (
              <li
                key={r.userId}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3"
              >
                <div className="flex-1">
                  <span className="font-medium">{r.name}</span>
                  {r.partnerName ? (
                    <span className="ml-2 text-sm text-neutral-500">搭档：{r.partnerName}</span>
                  ) : null}
                  <span
                    className={
                      r.status === "absent"
                        ? "ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-800"
                        : "ml-2 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
                    }
                  >
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>

                {r.checkedInAt ? (
                  <form action={`/api/admin/events/${id}/checkin`} method="post">
                    <input type="hidden" name="userId" value={r.userId} />
                    <input type="hidden" name="action" value="undo" />
                    <button type="submit" className="text-sm text-neutral-500 hover:text-neutral-900">
                      已签到 · 撤销
                    </button>
                  </form>
                ) : (
                  <form action={`/api/admin/events/${id}/checkin`} method="post">
                    <input type="hidden" name="userId" value={r.userId} />
                    <button
                      type="submit"
                      className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
                    >
                      签到
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {registered.length > 0 ? (
          <form action={`/api/admin/events/${id}/mark-absent`} method="post" className="pt-2">
            <button
              type="submit"
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-900"
            >
              活动结束：把未签到者标记为缺席
            </button>
          </form>
        ) : null}
      </section>

      {waitlisted.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-semibold">候补队列</h2>
          <p className="text-xs text-neutral-500">
            有人取消时按此顺序自动递补（D-28）。缺席过的人排在同条件下的后面。
          </p>
          <ol className="space-y-1 rounded-lg border border-neutral-200 bg-white p-3 text-sm">
            {waitlisted.map((r, i) => (
              <li key={r.userId}>
                {i + 1}. {r.name}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
