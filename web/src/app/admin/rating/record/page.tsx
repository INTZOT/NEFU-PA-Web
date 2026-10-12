import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canEnterAdmin } from "@/lib/roles";
import { listPublished } from "@/modules/event/service";
import { query } from "@/lib/db";
import { getActiveSeason } from "@/modules/rating/leaderboard";
import { Notice } from "@/components/Notice";

export default async function RecordMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; eventId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEnterAdmin(user)) redirect("/me");

  const { error, eventId } = await searchParams;
  const season = await getActiveSeason();

  // 只列本赛季有积分记录的成员 + 全部用户（新成员可能还没有记录）
  const members = await query<{ id: string; name: string; rating: number | null }>(
    `SELECT u.id, u.name, r.rating
       FROM users u
       LEFT JOIN season_ratings r ON r.user_id = u.id AND r.season_id = $1
      ORDER BY u.name`,
    [season?.id ?? "00000000-0000-0000-0000-000000000000"],
  );

  const events = await listPublished();

  return (
    <div className="space-y-5">
      <Link href="/admin/rating" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← 成绩录入
      </Link>
      <div>
        <h1 className="text-xl font-bold">录入比赛结果</h1>
        <p className="mt-1 text-sm text-neutral-500">
          选择双方成员与胜方，系统按标准 ELO 自动结算。单打每侧 1 人，双打每侧 2 人。
        </p>
      </div>

      <Notice error={error} />

      {!season ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          当前没有进行中的赛季，无法结算。
        </p>
      ) : null}

      {events.length === 0 ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          还没有已发布的赛事。请先在「活动管理」中发布一个活动。
        </p>
      ) : (
        <form
          action="/api/admin/rating/settle"
          method="post"
          className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium" htmlFor="eventId">赛事</label>
              <select
                id="eventId"
                name="eventId"
                required
                defaultValue={eventId ?? ""}
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              >
                <option value="">请选择</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}（{e.format === "doubles" ? "双打" : "单打"}）
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium" htmlFor="format">赛制</label>
              <select
                id="format"
                name="format"
                required
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              >
                <option value="singles">单打（每侧 1 人）</option>
                <option value="doubles">双打（每侧 2 人）</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium" htmlFor="sideA">
                A 方成员（按住 Ctrl / Cmd 可多选）
              </label>
              <select
                id="sideA"
                name="sideA"
                multiple
                required
                size={6}
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}（{m.rating ?? 500}）
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium" htmlFor="sideB">
                B 方成员（按住 Ctrl / Cmd 可多选）
              </label>
              <select
                id="sideB"
                name="sideB"
                multiple
                required
                size={6}
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}（{m.rating ?? 500}）
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <span className="block text-sm font-medium">胜方</span>
            <label className="mt-1 mr-4 inline-flex items-center gap-2 text-sm">
              <input type="radio" name="winner" value="a" required />A 方
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" name="winner" value="b" />B 方
            </label>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-sm text-white">
              结算
            </button>
            <span className="text-xs text-neutral-500">
              结算后双方积分立即变化，且不可修改（可撤销最近一场）。
            </span>
          </div>
        </form>
      )}
    </div>
  );
}
