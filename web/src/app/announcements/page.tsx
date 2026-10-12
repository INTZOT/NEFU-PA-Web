import Link from "next/link";
import { listPublished } from "@/modules/announcement/service";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function AnnouncementsPage() {
  const items = await listPublished(50);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">社团公告</h1>

      {items.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
          暂无公告。
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                {a.isPinned ? (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                    置顶
                  </span>
                ) : null}
                {a.category ? (
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                    {a.category}
                  </span>
                ) : null}
                <h2 className="font-semibold">
                  <Link href={`/announcements/${a.id}`} className="hover:underline">
                    {a.title}
                  </Link>
                </h2>
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap text-neutral-700">{a.content}</p>
              <p className="mt-3 text-xs text-neutral-400">
                {formatDate(a.publishedAt)}
                {a.authorName ? ` · ${a.authorName}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
