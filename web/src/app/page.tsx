import Link from "next/link";
import { getCurrentUser } from "@/lib/session";

export default async function HomePage() {
  const user = await getCurrentUser();

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
            <p>你好，<span className="font-semibold">{user.name}</span></p>
            <Link href="/me" className="inline-block text-sm text-blue-600 hover:underline">
              进入个人主页 →
            </Link>
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

      <section className="rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
        <p className="font-medium text-neutral-700">当前进度</p>
        <p className="mt-1">
          阶段 2「账号体系」正在搭建。公告、活动、约球与积分排行将在后续阶段开放。
        </p>
      </section>
    </div>
  );
}
