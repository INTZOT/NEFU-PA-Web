import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getById, getRoomDetail, ROOM_TTL_HOURS } from "@/modules/room/service";
import { Notice } from "@/components/Notice";

const STATUS_LABEL: Record<string, string> = {
  open: "招募中",
  full: "已满（锁死）",
  cancelled: "已取消",
  expired: "已过期",
};

export default async function RoomDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const { ok, error } = await searchParams;

  const room = await getById(id);
  if (!room) notFound();

  const detail = await getRoomDetail(id);
  if (!detail) notFound();

  const isInitiator = room.initiatorId === user.id;
  const myApplication = detail.applications.find((a) => a.userId === user.id);
  const pending = detail.applications.filter((a) => a.status === "pending");
  const active = room.status === "open" || room.status === "full";
  const alreadyJoined = detail.members.some((m) => m.userId === user.id);

  return (
    <div className="space-y-5">
      <Link href="/rooms" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← 约球大厅
      </Link>

      <Notice ok={ok} error={error} />

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              room.status === "open"
                ? "rounded bg-green-100 px-2 py-0.5 text-xs text-green-800"
                : "rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
            }
          >
            {STATUS_LABEL[room.status] ?? room.status}
          </span>
        </div>
        <h1 className="mt-2 text-xl font-bold">{room.timeSlot}</h1>
        <p className="mt-2 text-sm text-neutral-600">
          发起人 {room.initiatorName} · 已加入 {room.capacity - room.seatsLeft}/{room.capacity}
          {room.seatsLeft > 0 ? `（还差 ${room.seatsLeft} 人）` : ""}
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          发起后 {ROOM_TTL_HOURS} 小时内有效
        </p>
        {room.note ? (
          <p className="mt-3 text-sm whitespace-pre-wrap text-neutral-700">{room.note}</p>
        ) : null}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="font-semibold">参与成员</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {detail.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2">
              <span className="font-medium">{m.name}</span>
              {m.isInitiator ? (
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                  发起人
                </span>
              ) : null}
              <span className="text-xs text-neutral-400">自评分 {m.selfRating}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="font-semibold">我的操作</h2>

        {!active ? (
          <p className="text-sm text-neutral-500">这个房间已经结束了。</p>
        ) : isInitiator ? (
          <form action={`/api/rooms/${room.id}/cancel`} method="post">
            <button type="submit" className="text-sm text-red-600 hover:text-red-800">
              取消房间
            </button>
          </form>
        ) : alreadyJoined ? (
          <div className="space-y-2">
            <p className="text-sm text-green-700">你已经在房间里了。</p>
            <form action={`/api/rooms/${room.id}/withdraw`} method="post">
              <button type="submit" className="text-sm text-neutral-500 hover:text-neutral-900">
                退出（会恢复一个空位）
              </button>
            </form>
          </div>
        ) : myApplication?.status === "pending" ? (
          <p className="text-sm text-amber-700">已申请，等待发起人同意。</p>
        ) : room.status === "full" ? (
          <p className="text-sm text-neutral-500">房间已满。有人退出时会重新开放。</p>
        ) : (
          <form action={`/api/rooms/${room.id}/apply`} method="post">
            <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-sm text-white">
              申请加入
            </button>
          </form>
        )}
      </section>

      {isInitiator && pending.length > 0 ? (
        <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">待处理的申请（{pending.length}）</h2>
          <ul className="space-y-2">
            {pending.map((a) => (
              <li
                key={a.applicationId}
                className="flex flex-wrap items-center gap-3 rounded border border-amber-200 bg-white p-3"
              >
                <div className="flex-1 text-sm">
                  <span className="font-medium">{a.name}</span>
                  <span className="ml-2 text-xs text-neutral-400">自评分 {a.selfRating}</span>
                </div>
                <form
                  action={`/api/applications/${a.applicationId}/decide`}
                  method="post"
                  className="flex items-center gap-2"
                >
                  <input type="hidden" name="roomId" value={room.id} />
                  <button
                    type="submit"
                    name="decision"
                    value="approve"
                    className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
                  >
                    同意
                  </button>
                  <button
                    type="submit"
                    name="decision"
                    value="reject"
                    className="text-sm text-neutral-500 hover:text-neutral-900"
                  >
                    拒绝
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-800">
            同意后若人数达上限，房间会自动锁死，不再接受申请。
          </p>
        </section>
      ) : null}
    </div>
  );
}
