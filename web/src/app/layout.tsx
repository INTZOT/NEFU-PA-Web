import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { canEnterAdmin } from "@/lib/roles";
import "./globals.css";

// 注意：不使用 next/font/google —— 构建环境可能无法访问 Google 字体服务，
// 直接依赖系统字体栈，避免构建期的网络依赖。

export const metadata: Metadata = {
  title: "东北林业大学匹克球社团",
  description: "东北林业大学匹克球社团官方网站",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 导航需要知道登录状态（未登录显示登录/注册，已登录显示个人主页/后台）
  const user = await getCurrentUser();

  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-neutral-50 text-neutral-900">
        <header className="border-b border-neutral-200 bg-white">
          <nav className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold">
              匹克球社团
            </Link>
            <Link href="/club" className="text-neutral-600 hover:text-neutral-900">
              社团介绍
            </Link>
            <Link href="/announcements" className="text-neutral-600 hover:text-neutral-900">
              公告
            </Link>
            <Link href="/events" className="text-neutral-600 hover:text-neutral-900">
              活动
            </Link>
            <span className="flex-1" />
            {user ? (
              <>
                <Link href="/rooms" className="text-neutral-600 hover:text-neutral-900">
                  约球
                </Link>
                <Link href="/leaderboard" className="text-neutral-600 hover:text-neutral-900">
                  排行
                </Link>
                {canEnterAdmin(user) ? (
                  <Link href="/admin" className="text-neutral-600 hover:text-neutral-900">
                    管理
                  </Link>
                ) : null}
                <Link href="/me" className="text-neutral-600 hover:text-neutral-900">
                  {user.name}
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="text-neutral-600 hover:text-neutral-900">
                  登录
                </Link>
                <Link href="/register" className="text-neutral-600 hover:text-neutral-900">
                  注册
                </Link>
              </>
            )}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-neutral-200 px-4 py-4 text-center text-xs text-neutral-500">
          东北林业大学匹克球社团
        </footer>
      </body>
    </html>
  );
}
