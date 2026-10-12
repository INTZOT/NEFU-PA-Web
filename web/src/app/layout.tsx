import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { canEnterAdmin } from "@/lib/roles";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

// 注意：不使用 next/font/google —— 构建环境可能无法访问 Google 字体服务，
// 直接依赖系统字体栈（在 globals.css 里定义），避免构建期的网络依赖。

export const metadata: Metadata = {
  // 图标不在这里声明：Next.js 的 App Router 会自动识别 app/favicon.ico、app/icon.png、
  // app/apple-icon.png 并注入对应的 <link>。约定优于配置，也避免两处声明不一致。
  title: {
    default: "东北林业大学匹克球协会",
    // 子页面若自己导出 title，会以「页面名 · 协会名」的形式拼接
    template: "%s · 东北林业大学匹克球协会",
  },
  description: "东北林业大学匹克球协会官方网站",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 登录状态在服务端算好传给导航；导航本身只是个客户端展示组件
  const user = await getCurrentUser();

  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-canvas text-ink">
        <SiteNav user={user ? { name: user.name, isAdmin: canEnterAdmin(user) } : null} />

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>

        <footer className="mt-8 border-t border-line bg-surface">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-6 text-xs text-ink-subtle">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-96.png" alt="" width={32} height={32} className="h-8 w-8 opacity-80" />
            <div className="space-y-0.5">
              <p className="font-medium text-ink-muted">东北林业大学匹克球协会</p>
              <p>Northeast Forestry University Pickleball Association</p>
            </div>
            <span className="flex-1" />
            <Link href="/club" className="transition hover:text-brand">
              社团介绍
            </Link>
            <Link href="/announcements" className="transition hover:text-brand">
              公告
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
