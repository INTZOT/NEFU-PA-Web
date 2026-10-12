import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isSuperAdmin } from "@/lib/roles";
import { listAll, archiveDue } from "@/modules/rating/season";
import { Notice } from "@/components/Notice";

export default async function SeasonsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // 赛季是全局配置，仅超管可改（与「成员与权限」同级）
  if (!isSuperAdmin(user)) redirect("/admin");

  const { ok, error } = await searchParams;
  // 惰性归档：已过结束日期的赛季自动转归档（D-25）
  const archived = await archiveDue();
  const seasons = await listAll();

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← 管理后台
        </Link>
        <h1 className="mt-1 text-xl font-bold">赛季管理</h1>
        <p className="mt-1 text-sm text-neutral-500">
          一赛季 = 一学年。学年结束当天自动归档（旧赛季数据完整保留），
          新赛季所有成员重新从 500 起算。
        </p>
      </div>

      {archived.length > 0 ? (
        <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          已自动归档：{archived.join("、")}
        </p>
      ) : null}

      <Notice ok={ok} error={error} />

      {seasons.map((s) => (
        <form
          key={s.id}
          action={`/api/admin/seasons/${s.id}`}
          method="post"
          className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{s.name}</h2>
            <span
              className={
                s.status === "active"
                  ? "rounded bg-green-100 px-2 py-0.5 text-xs text-green-800"
                  : "rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500"
              }
            >
              {s.status === "active" ? "进行中" : "已归档"}
            </span>
            {s.isEstimated ? (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                起止日期为推断值，请校正
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-neutral-500">学年开始</span>
              <input
                type="date"
                name="startDate"
                defaultValue={s.startDate}
                required
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="text-neutral-500">学年结束</span>
              <input
                type="date"
                name="endDate"
                defaultValue={s.endDate}
                required
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="text-neutral-500">秋季学期开始</span>
              <input
                type="date"
                name="fallStart"
                defaultValue={s.fallStart ?? ""}
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="text-neutral-500">秋季学期结束</span>
              <input
                type="date"
                name="fallEnd"
                defaultValue={s.fallEnd ?? ""}
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="text-neutral-500">春季学期开始</span>
              <input
                type="date"
                name="springStart"
                defaultValue={s.springStart ?? ""}
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="text-neutral-500">春季学期结束</span>
              <input
                type="date"
                name="springEnd"
                defaultValue={s.springEnd ?? ""}
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5"
              />
            </label>
          </div>

          <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-sm text-white">
            保存{s.name}的日期
          </button>
        </form>
      ))}

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="font-semibold">开启新赛季</h2>
        <p className="mt-1 text-xs text-neutral-500">
          新建后当前赛季会转为归档（数据保留），成员在新赛季重新从 500 起算。
        </p>
        <form action="/api/admin/seasons" method="post" className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="text-neutral-500">赛季名</span>
              <input
                name="name"
                required
                placeholder="2027/2028"
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="text-neutral-500">学年开始</span>
              <input
                type="date"
                name="startDate"
                required
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="text-neutral-500">学年结束</span>
              <input
                type="date"
                name="endDate"
                required
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5"
              />
            </label>
          </div>
          <button type="submit" className="rounded border border-neutral-300 px-4 py-2 text-sm">
            新建并切换
          </button>
        </form>
      </section>
    </div>
  );
}
