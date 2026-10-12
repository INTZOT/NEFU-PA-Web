import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { listPublished } from "@/modules/announcement/service";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function HomePage() {
  const user = await getCurrentUser();
  const announcements = await listPublished(3);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold">东北林业大学匹克球社团</h1>
        <p className="mt-2 text-neutral-600">
          欢迎加入匹克球社团。这里会发布社团公告与活动信息；成员登录后可使用约球、
          活动报名与积分排行等功能。
        </p>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        {user ? (
          <div className="space-y-2">
            <p>
              你好，<span className="font-semibold">{user.name}</span>
            </p>
            <div className="flex flex-wrap gap-4 text-sm">
              <Link href="/me" className="text-blue-600 hover:underline">
                进入个人主页 →
              </Link>
              <Link href="/club" className="text-neutral-500 hover:text-neutral-900">
                社团介绍
              </Link>
              <Link href="/events" className="text-neutral-500 hover:text-neutral-900">
                社团活动
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-600">
              本站仅对社团成员开放。首次使用请先在 QQ 群内私聊社团机器人获取邀请码，
              再凭邀请码完成注册。
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link href="/register" className="rounded bg-neutral-900 px-4 py-2 text-white">
                我有邀请码，去注册
              </Link>
              <Link href="/login" className="rounded border border-neutral-300 px-4 py-2">
                已注册，去登录
              </Link>
            </div>
          </div>
        )}
      </section>

      {announcements.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">最新公告</h2>
            <Link
              href="/announcements"
              className="text-sm text-neutral-500 hover:text-neutral-900"
            >
              全部公告 →
            </Link>
          </div>
          <ul className="space-y-3">
            {announcements.map((a) => (
              <li key={a.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {a.isPinned ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      置顶
                    </span>
                  ) : null}
                  <h3 className="font-medium">
                    <Link href={`/announcements/${a.id}`} className="hover:underline">
                      {a.title}
                    </Link>
                  </h3>
                </div>
                <p className="mt-1 line-clamp-3 text-sm whitespace-pre-wrap text-neutral-600">
                  {a.content}
                </p>
                <p className="mt-2 text-xs text-neutral-400">{formatDate(a.publishedAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
