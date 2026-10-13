import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { list, markAllRead, unreadCount } from "@/modules/notification/service";

export const metadata = { title: "消息" };

/**
 * 站内消息列表（D-43）。
 *
 * 只对已登录成员开放：通知内容涉及约球、活动等成员内部信息。
 */

/** 把时间显示成「刚刚 / N 分钟前 / N 小时前 / 日期」。 */
function when(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [items, unread] = await Promise.all([
    list(user.id),
    unreadCount(user.id),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">
          消息
          {unread > 0 ? (
            <span className="ml-2 align-middle text-sm font-normal text-ink-muted">
              {unread} 条未读
            </span>
          ) : null}
        </h1>

        {unread > 0 ? (
          <form action={markAllReadAction}>
            <button
              type="submit"
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm transition hover:bg-surface-muted"
            >
              全部标为已读
            </button>
          </form>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-ink-muted">
          暂无消息。约球有人申请、报名被审核时会在这里通知你。
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const unreadThis = n.readAt === null;
            // 有跳转目标时点整条即「标记已读 + 跳过去」；
            // 没有目标的（如角色变更）就只标记已读，不做无意义的跳转。
            const href = n.link
              ? `/api/notifications/read?id=${n.id}&to=${encodeURIComponent(n.link)}`
              : `/api/notifications/read?id=${n.id}&to=/notifications`;
            return (
              <li key={n.id}>
                <Link
                  href={href}
                  className={[
                    "block rounded-xl border p-3.5 transition hover:border-brand/40",
                    unreadThis
                      ? "border-brand/30 bg-brand-soft/40"
                      : "border-line bg-surface",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-2">
                    {unreadThis ? (
                      <span
                        aria-label="未读"
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-danger"
                      />
                    ) : (
                      <span className="mt-1.5 h-2 w-2 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className={unreadThis ? "font-medium text-ink" : "text-ink"}>
                        {n.title}
                      </p>
                      {n.body ? (
                        <p className="text-sm text-ink-muted">{n.body}</p>
                      ) : null}
                      <p className="text-xs text-ink-subtle">{when(n.createdAt)}</p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** 「全部标为已读」的表单动作。放在同文件里，避免为一个小动作单开路由。 */
async function markAllReadAction() {
  "use server";
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await markAllRead(user.id);
  redirect("/notifications");
}
