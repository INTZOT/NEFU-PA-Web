import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { queryOne } from "@/lib/db";

// 五档话术：仅作为选择自评分时的参考，不跟随展示（D-21）
const TIERS = [
  { max: 200, label: "小白" },
  { max: 400, label: "新手" },
  { max: 600, label: "熟手" },
  { max: 800, label: "高手" },
  { max: 1000, label: "大师" },
];

const ROLE_LABEL: Record<string, string> = {
  member: "成员",
  admin: "管理员",
  super_admin: "超级管理员",
};

function tierOf(value: number): string {
  return TIERS.find((t) => value <= t.max)?.label ?? "大师";
}

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; error?: string; saved?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { welcome, error, saved } = await searchParams;

  // 本赛季的比赛积分（D-22：与自评分是两个独立的量）
  const season = await queryOne<{ name: string; rating: number; wins: number; losses: number }>(
    `SELECT s.name, r.rating, r.wins, r.losses
       FROM season_ratings r
       JOIN seasons s ON s.id = r.season_id
      WHERE r.user_id = $1 AND s.status = 'active'
      LIMIT 1`,
    [user.id],
  );

  return (
    <div className="space-y-6">
      {welcome ? (
        <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          注册成功，欢迎加入社团！下面可以确认一下你的自评分。
        </p>
      ) : null}
      {saved ? (
        <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          自评分已更新。
        </p>
      ) : null}
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h1 className="text-xl font-bold">{user.name}</h1>
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-neutral-500">角色</dt>
          <dd>{ROLE_LABEL[user.role] ?? user.role}</dd>
          <dt className="text-neutral-500">学号</dt>
          <dd>
            {user.studentId}
            <span className="ml-2 text-xs text-neutral-400">
              登录用；不对其他成员展示（R-53）
            </span>
          </dd>
        </dl>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="font-semibold">比赛积分</h2>
        {season ? (
          <div className="mt-2 space-y-1 text-sm">
            <p>
              本赛季（{season.name}）：
              <span className="text-lg font-bold">{season.rating}</span>
            </p>
            <p className="text-neutral-500">
              战绩 {season.wins} 胜 {season.losses} 负
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">
            当前没有进行中的赛季。管理员配置赛季起止日期后，此处会显示你的比赛积分。
          </p>
        )}
        <p className="mt-3 text-xs text-neutral-500">
          比赛积分只由官方比赛产生，按标准 ELO 结算（K=40），按学年归档。
        </p>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="font-semibold">个人自评分</h2>
        <p className="mt-1 text-sm text-neutral-600">
          这是你对自己水平的评估，用于约球时供他人参考。它不随比赛结果变化，可随时修改。
        </p>

        <form action="/api/me/self-rating" method="post" className="mt-3 space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="range"
              name="selfRating"
              min="0"
              max="1000"
              step="10"
              defaultValue={user.selfRating}
              className="flex-1"
            />
            <span className="text-sm text-neutral-500">0–1000</span>
          </div>
          <p className="text-xs text-neutral-500">
            档位参考：小白 0–200 · 新手 200–400 · 熟手 400–600 · 高手 600–800 · 大师 800–1000
          </p>
          <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-sm text-white">
            保存
          </button>
        </form>

        <p className="mt-3 text-sm">
          当前自评分：
          <span className="font-semibold">{user.selfRating}</span>
          <span className="ml-2 text-neutral-500">（{tierOf(user.selfRating)}）</span>
        </p>
      </section>

      <form action="/api/auth/logout" method="post">
        <button type="submit" className="text-sm text-neutral-500 hover:text-neutral-900">
          退出登录
        </button>
      </form>
    </div>
  );
}
