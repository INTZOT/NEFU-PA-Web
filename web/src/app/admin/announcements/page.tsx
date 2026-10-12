import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canEnterAdmin } from "@/lib/roles";
import { listAll } from "@/modules/announcement/service";
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

export default async function AnnouncementAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEnterAdmin(user)) redirect("/me");

  const { ok, error } = await searchParams;
  const items = await listAll();
  const now = Date.now();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-sm text-ink-muted hover:text-ink">
            ← 管理后台
          </Link>
          <h1 className="mt-1 text-xl font-bold">社团公告</h1>
        </div>
        <Link
          href="/admin/announcements/new"
          className="rounded bg-brand px-4 py-2 text-sm text-white"
        >
          新建公告
        </Link>
      </div>

      <Notice ok={ok} error={error} />

      {items.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-ink-muted">
          还没有公告。点右上角「新建公告」发布第一条。
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => {
            const expired = a.expiresAt ? new Date(a.expiresAt).getTime() < now : false;
            return (
              <li
                key={a.id}
                className="rounded-xl border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {a.isPinned ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">置顶</span>
                  ) : null}
                  {a.category ? (
                    <span className="rounded bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
                      {a.category}
                    </span>
                  ) : null}
                  {expired ? (
                    <span className="rounded bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
                      已过期
                    </span>
                  ) : null}
                  <span className="font-medium">{a.title}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-ink-muted whitespace-pre-wrap">
                  {a.content}
                </p>
                <div className="mt-2 flex items-center gap-3 text-xs text-ink-subtle">
                  <span>{formatTime(a.publishedAt)}</span>
                  {a.authorName ? <span>{a.authorName}</span> : null}
                  <Link
                    href={`/admin/announcements/${a.id}`}
                    className="text-ink-muted hover:text-ink"
                  >
                    编辑
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
