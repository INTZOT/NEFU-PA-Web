import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Notice } from "@/components/Notice";

export default async function NewRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { error } = await searchParams;

  return (
    <div className="space-y-5">
      <Link href="/rooms" className="text-sm text-ink-muted hover:text-ink">
        ← 约球大厅
      </Link>
      <h1 className="text-xl font-bold">发起约球</h1>
      <Notice error={error} />

      <div className="rounded-xl border border-line bg-surface p-4">
        <form action="/api/rooms" method="post" className="space-y-4">
          <div>
            <label className="block text-sm font-medium" htmlFor="timeSlot">
              时间段
            </label>
            <input
              id="timeSlot"
              name="timeSlot"
              required
              maxLength={60}
              placeholder="如：周三 18:00–20:00"
              className="mt-1 w-full rounded border border-line-strong px-3 py-2 outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="block text-sm font-medium" htmlFor="capacity">
              人数上限（含你自己）
            </label>
            <input
              id="capacity"
              name="capacity"
              type="number"
              min={2}
              max={20}
              defaultValue={4}
              required
              className="mt-1 w-full rounded border border-line-strong px-3 py-2 outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="block text-sm font-medium" htmlFor="note">
              备注（可选）
            </label>
            <textarea
              id="note"
              name="note"
              rows={3}
              maxLength={200}
              placeholder="场地、水平要求、自带球拍等，都写在这里"
              className="mt-1 w-full rounded border border-line-strong px-3 py-2 outline-none focus:border-brand"
            />
            <p className="mt-1 text-xs text-ink-muted">
              项目刻意不设场地与水平字段，统一写在备注里（R-55）。
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" className="rounded bg-brand px-4 py-2 text-sm text-white">
              发布
            </button>
            <Link href="/rooms" className="text-sm text-ink-muted hover:text-ink">
              取消
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
