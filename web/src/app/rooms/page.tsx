import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listActive } from "@/modules/room/service";

export const metadata = { title: "约球大厅 · 东北林业大学匹克球社团" };

function remaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "已过期";
  const hours = Math.floor(ms / 3600_000);
  if (hours >= 1) return `剩 ${hours} 小时`;
  return `剩 ${Math.max(1, Math.floor(ms / 60_000))} 分钟`;
}

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await searchParams;
  const rooms = await listActive();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">约球大厅</h1>
          <p className="mt-1 text-sm text-neutral-500">
            发起一个时间段，等人加入。满员后自动锁死；有人退出会重新开放；
            24 小时后自动过期。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/rooms/mine" className="text-sm text-neutral-500 hover:text-neutral-900">
            我的约球
          </Link>
          <Link
            href="/rooms/new"
            className="rounded bg-neutral-900 px-4 py-2 text-sm text-white"
          >
            发起约球
          </Link>
        </div>
      </div>

      {rooms.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
          暂时没有进行中的约球。点右上角「发起约球」开一个。
        </p>
      ) : (
        <ul className="space-y-3">
          {rooms.map((room) => (
            <li key={room.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={
                    room.status === "full"
                      ? "rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
                      : "rounded bg-green-100 px-2 py-0.5 text-xs text-green-800"
                  }
                >
                  {room.status === "full" ? "已满" : "招募中"}
                </span>
                <Link href={`/rooms/${room.id}`} className="font-semibold hover:underline">
                  {room.timeSlot}
                </Link>
              </div>
              <p className="mt-1 text-sm text-neutral-500">
                发起人 {room.initiatorName} · 已加入 {room.capacity - room.seatsLeft}/{room.capacity}
                {room.seatsLeft > 0 ? `（还差 ${room.seatsLeft} 人）` : ""}
                {room.pendingCount > 0 ? ` · 待处理 ${room.pendingCount}` : ""}
                {" · "}
                {remaining(room.expiresAt)}
              </p>
              {room.note ? (
                <p className="mt-1 text-sm whitespace-pre-wrap text-neutral-600">{room.note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
