import Link from "next/link";
import type { Announcement } from "@/modules/announcement/service";

/**
 * 公告表单，新建与编辑共用。
 *
 * 用原生 form POST（而不是 fetch），与项目其余表单保持一致：
 * 提交 → 服务端处理 → 303 重定向 → 用查询参数带回结果。
 */
export function AnnouncementForm({
  action,
  announcement,
  submitLabel,
}: {
  action: string;
  announcement?: Announcement;
  submitLabel: string;
}) {
  const expires = announcement?.expiresAt
    ? new Date(announcement.expiresAt).toISOString().slice(0, 10)
    : "";

  return (
    <form action={action} method="post" className="space-y-4">
      <div>
        <label className="block text-sm font-medium" htmlFor="title">
          标题
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={100}
          defaultValue={announcement?.title ?? ""}
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
        />
      </div>

      <div>
        <label className="block text-sm font-medium" htmlFor="content">
          正文
        </label>
        <textarea
          id="content"
          name="content"
          required
          rows={8}
          defaultValue={announcement?.content ?? ""}
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
        />
        <p className="mt-1 text-xs text-neutral-500">换行会原样保留。</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium" htmlFor="category">
            分类（可选）
          </label>
          <input
            id="category"
            name="category"
            maxLength={20}
            placeholder="如：通知 / 活动 / 积分"
            defaultValue={announcement?.category ?? ""}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium" htmlFor="expiresAt">
            失效日期（可选）
          </label>
          <input
            id="expiresAt"
            name="expiresAt"
            type="date"
            defaultValue={expires}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
          />
          <p className="mt-1 text-xs text-neutral-500">
            留空表示长期有效。过期后自动从首页与公告列表消失。
          </p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isPinned"
          defaultChecked={announcement?.isPinned ?? false}
        />
        置顶（排在列表最前）
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-sm text-white">
          {submitLabel}
        </button>
        <Link
          href="/admin/announcements"
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
