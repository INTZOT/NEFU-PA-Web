import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canEnterAdmin } from "@/lib/roles";
import { listAll } from "@/modules/event/service";
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

export default async function EventAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEnterAdmin(user)) redirect("/me");

  const { ok, error } = await searchParams;
  const events = await listAll();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-sm text-neutral-500 hover:text-neutral-900">
            ← 管理后台
          </Link>
          <h1 className="mt-1 text-xl font-bold">活动管理</h1>
        </div>
        <Link
          href="/admin/events/new"
          className="rounded bg-neutral-900 px-4 py-2 text-sm text-white"
        >
          发布活动
        </Link>
      </div>

      <Notice ok={ok} error={error} />

      {events.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
          还没有活动。
        </p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                  {e.format === "doubles" ? "双打" : "单打"}
                </span>
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                  {e.status}
                </span>
                <Link
                  href={`/admin/events/${e.id}`}
                  className="font-medium hover:underline"
                >
                  {e.title}
                </Link>
              </div>
              <p className="mt-1 text-sm text-neutral-500">
                {formatTime(e.startAt)}
                {e.location ? ` · ${e.location}` : ""}
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                {e.occupied}/{e.capacity} {e.capacityUnit === "teams" ? "队" : "人"}
                {e.waitlistCount > 0 ? ` · 候补 ${e.waitlistCount}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
