import Link from "next/link";
import { listPublished, isRegistrationOpen } from "@/modules/event/service";

export const metadata = { title: "活动 · 东北林业大学匹克球社团" };

function formatTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_LABEL: Record<string, string> = {
  open: "报名中",
  closed: "已截止",
  finished: "已结束",
  draft: "草稿",
};

export default async function EventsPage() {
  const events = await listPublished();

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">社团活动</h1>

      {events.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
          暂无活动。
        </p>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => {
            const open = isRegistrationOpen(e);
            return (
              <li key={e.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                    {e.format === "doubles" ? "双打" : "单打"}
                  </span>
                  <span
                    className={
                      open
                        ? "rounded bg-green-100 px-2 py-0.5 text-xs text-green-800"
                        : "rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500"
                    }
                  >
                    {open ? "报名中" : (STATUS_LABEL[e.status] ?? e.status)}
                  </span>
                  <h2 className="font-semibold">
                    <Link href={`/events/${e.id}`} className="hover:underline">
                      {e.title}
                    </Link>
                  </h2>
                </div>
                <p className="mt-2 text-sm text-neutral-600">
                  {formatTime(e.startAt)}
                  {e.location ? ` · ${e.location}` : ""}
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  名额 {e.capacity} {e.capacityUnit === "teams" ? "队" : "人"}
                  {e.remaining > 0 ? ` · 还剩 ${e.remaining}` : " · 已满"}
                  {e.waitlistCount > 0 ? ` · 候补 ${e.waitlistCount}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
