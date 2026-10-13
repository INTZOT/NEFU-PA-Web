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
          {/*
           * 时间用真实日期时间选择，不再是自由文本。
           *
           * 这样过期时间才能按「活动结束后」算 —— 原来从发布时刻起算 24 小时，
           * 想组织下周的活动就非得等到临近才能发（D-44）。
           */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium" htmlFor="startAt">
                开始时间
              </label>
              <input
                id="startAt"
                name="startAt"
                type="datetime-local"
                required
                className="mt-1 w-full rounded border border-line-strong px-3 py-2 outline-none focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-sm font-medium" htmlFor="endAt">
                结束时间（可选）
              </label>
              <input
                id="endAt"
                name="endAt"
                type="datetime-local"
                className="mt-1 w-full rounded border border-line-strong px-3 py-2 outline-none focus:border-brand"
              />
            </div>
          </div>
          <p className="text-xs text-ink-muted">
            不填结束时间也可以（打到几点常说不准）。房间会在活动结束后自动下架。
          </p>

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
