"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 顶部导航。
 *
 * 为什么是客户端组件：需要 usePathname 来判断当前页并高亮。
 * 登录状态由服务端（layout）算好后作为 props 传入 —— 这里不做任何数据获取。
 *
 * 移动端：整条导航可横向滚动（overflow-x-auto + 不换行），
 * 避免窄屏时链接被挤压换行、破坏排版。
 */

export interface NavUser {
  name: string;
  isAdmin: boolean;
}

interface NavItem {
  href: string;
  label: string;
  /** 是否只在登录后显示。 */
  memberOnly?: boolean;
}

const PUBLIC_ITEMS: NavItem[] = [
  { href: "/club", label: "社团介绍" },
  { href: "/announcements", label: "公告" },
  { href: "/events", label: "活动" },
  { href: "/gallery", label: "相册" },
];

const MEMBER_ITEMS: NavItem[] = [
  { href: "/rooms", label: "约球", memberOnly: true },
  { href: "/leaderboard", label: "排行", memberOnly: true },
];

function isActive(pathname: string, href: string): boolean {
  // 首页要精确匹配，否则任何路径都会命中 "/"
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "rounded-lg px-2.5 py-1.5 whitespace-nowrap transition",
        active
          ? "bg-brand-soft font-medium text-brand-ink"
          : "text-ink-muted hover:bg-surface-muted hover:text-ink",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export function SiteNav({ user }: { user: NavUser | null }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-2.5 text-sm">
        {/* 品牌区：logo + 名称，点击回首页 */}
        <Link
          href="/"
          className="mr-2 flex shrink-0 items-center gap-2 rounded-lg py-1 pr-1 transition hover:opacity-80"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-96.png" alt="" width={28} height={28} className="h-7 w-7" />
          <span className="font-bold tracking-tight text-ink">匹克球协会</span>
        </Link>

        {/* 主导航：窄屏可横向滚动 */}
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {PUBLIC_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={isActive(pathname, item.href)}
            />
          ))}
          {user
            ? MEMBER_ITEMS.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={isActive(pathname, item.href)}
                />
              ))
            : null}
          {user?.isAdmin ? (
            <NavLink
              href="/admin"
              label="管理"
              active={isActive(pathname, "/admin")}
            />
          ) : null}
        </div>

        {/* 账号区：固定在右侧，不参与滚动 */}
        <div className="flex shrink-0 items-center gap-1">
          {user ? (
            <NavLink
              href="/me"
              label={user.name}
              active={isActive(pathname, "/me")}
            />
          ) : (
            <>
              <NavLink href="/login" label="登录" active={isActive(pathname, "/login")} />
              <Link
                href="/register"
                className="rounded-lg bg-brand px-3 py-1.5 whitespace-nowrap font-medium text-white transition hover:bg-brand-strong"
              >
                注册
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
