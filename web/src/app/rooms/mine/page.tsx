import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listMine } from "@/modules/room/service";
import { Notice } from "@/components/Notice";

const STATUS_LABEL: Record<string, string> = {
  open: "招募中",
  full: "已满",
  cancelled: "已取消",
  expired: "已过期",
};

export default async function MyRoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { ok, error } = await searchParams;
  const { initiated, joined } = await listMine(user.id);
  const pendingTotal = initiated.reduce((n, r) => n + r.pendingCount, 0);

  const RoomList = ({ rooms }: { rooms: typeof initiated }) => (
    <ul className="space-y-2">
      {rooms.map((r) => (
        <li key={r.id} className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
              {STATUS_LABEL[r.status] ?? r.status}
            </span>
            <Link href={`/rooms/${r.id}`} className="font-medium hover:underline">
              {r.timeSlot}
            </Link>
            {r.pendingCount > 0 ? (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                待处理 {r.pendingCount}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            已加入 {r.capacity - r.seatsLeft}/{r.capacity}
          </p>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/rooms" className="text-sm text-neutral-500 hover:text-neutral-900">
            ← 约球大厅
          </Link>
          <h1 className="mt-1 text-xl font-bold">我的约球</h1>
        </div>
        <Link
          href="/rooms/new"
          className="rounded bg-neutral-900 px-4 py-2 text-sm text-white"
        >
          发起约球
        </Link>
      </div>

      <Notice ok={ok} error={error} />

      {pendingTotal > 0 ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          你有 {pendingTotal} 条待处理的加入申请，点进对应房间即可审批。
        </p>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-semibold">我发起的</h2>
        {initiated.length === 0 ? (
          <p className="text-sm text-neutral-500">还没有发起过约球。</p>
        ) : (
          <RoomList rooms={initiated} />
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">我加入的</h2>
        {joined.length === 0 ? (
          <p className="text-sm text-neutral-500">还没有加入别人的约球。</p>
        ) : (
          <RoomList rooms={joined} />
        )}
      </section>
    </div>
  );
}
