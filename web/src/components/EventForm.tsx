import Link from "next/link";

/**
 * 发布活动表单。
 *
 * 名额单位由赛制决定（D-20）：单打按人、双打按队，
 * 因此表单不提供单位选项，而是随赛制自动切换 —— 避免出现「双打按人」这种矛盾组合。
 */
export function EventForm({ action, submitLabel }: { action: string; submitLabel: string }) {
  return (
    <form action={action} method="post" className="space-y-4">
      <div>
        <label className="block text-sm font-medium" htmlFor="title">标题</label>
        <input
          id="title"
          name="title"
          required
          maxLength={100}
          placeholder="如：2026 年春季匹克球友谊赛"
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
        />
      </div>

      <div>
        <label className="block text-sm font-medium" htmlFor="description">说明（可选）</label>
        <textarea
          id="description"
          name="description"
          rows={4}
          placeholder="赛制、注意事项等。换行会原样保留。"
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium" htmlFor="format">赛制</label>
          <select
            id="format"
            name="format"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
          >
            <option value="singles">单打（名额按人）</option>
            <option value="doubles">双打（名额按队）</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium" htmlFor="capacity">名额上限</label>
          <input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            required
            defaultValue={16}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
          />
          <p className="mt-1 text-xs text-neutral-500">双打填队伍数，一支队算一个名额。</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium" htmlFor="startAt">开始时间</label>
          <input
            id="startAt"
            name="startAt"
            type="datetime-local"
            required
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium" htmlFor="location">地点（可选）</label>
          <input
            id="location"
            name="location"
            maxLength={80}
            placeholder="如：体育馆 3 号场"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium" htmlFor="registrationDeadline">
            报名截止（可选）
          </label>
          <input
            id="registrationDeadline"
            name="registrationDeadline"
            type="datetime-local"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
          />
          <p className="mt-1 text-xs text-neutral-500">留空则默认赛前 24 小时。</p>
        </div>

        <div>
          <label className="block text-sm font-medium" htmlFor="status">状态</label>
          <select
            id="status"
            name="status"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
          >
            <option value="draft">草稿（不公开、不能报名）</option>
            <option value="open">开放报名</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-sm text-white">
          {submitLabel}
        </button>
        <Link href="/admin/events" className="text-sm text-neutral-500 hover:text-neutral-900">
          取消
        </Link>
      </div>
    </form>
  );
}
