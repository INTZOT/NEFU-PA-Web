import Link from "next/link";
import { notFound } from "next/navigation";
import { getById } from "@/modules/announcement/service";

function formatTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const announcement = await getById(id);
  if (!announcement) notFound();

  // 已过期的公告：列表里不显示，但直接访问链接仍可看（可能是群里发过的旧链接）
  const expired = announcement.expiresAt
    ? new Date(announcement.expiresAt).getTime() < Date.now()
    : false;

  return (
    <div className="space-y-5">
      <Link
        href="/announcements"
        className="text-sm text-ink-muted hover:text-ink"
      >
        ← 社团公告
      </Link>

      <article className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          {announcement.isPinned ? (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">置顶</span>
          ) : null}
          {announcement.category ? (
            <span className="rounded bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
              {announcement.category}
            </span>
          ) : null}
          {expired ? (
            <span className="rounded bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
              已过期
            </span>
          ) : null}
        </div>

        <h1 className="mt-2 text-xl font-bold">{announcement.title}</h1>
        <p className="mt-2 text-xs text-ink-subtle">
          {formatTime(announcement.publishedAt)}
          {announcement.authorName ? ` · ${announcement.authorName}` : ""}
        </p>

        <div className="mt-4 text-sm leading-relaxed whitespace-pre-wrap text-ink">
          {announcement.content}
        </div>
      </article>
    </div>
  );
}
