import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canEnterAdmin, isSuperAdmin } from "@/lib/roles";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEnterAdmin(user)) redirect("/me");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">管理后台</h1>
        <p className="mt-1 text-sm text-neutral-500">
          当前登录：{user.name}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/admin/announcements"
          className="rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-neutral-900"
        >
          <h2 className="font-semibold">社团公告</h2>
          <p className="mt-1 text-sm text-neutral-500">
            发布与维护公告，首页与公告页展示
          </p>
        </Link>

        <Link
          href="/admin/club"
          className="rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-neutral-900"
        >
          <h2 className="font-semibold">社团介绍</h2>
          <p className="mt-1 text-sm text-neutral-500">
            概况、组织架构、章程、联系方式（游客可见）
          </p>
        </Link>

        {isSuperAdmin(user) ? (
          <Link
            href="/admin/members"
            className="rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-neutral-900"
          >
            <h2 className="font-semibold">成员与权限</h2>
            <p className="mt-1 text-sm text-neutral-500">
              设置或取消管理员（仅超级管理员可见）
            </p>
          </Link>
        ) : null}

        {isSuperAdmin(user) ? (
          <Link
            href="/admin/audit"
            className="rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-neutral-900"
          >
            <h2 className="font-semibold">操作记录</h2>
            <p className="mt-1 text-sm text-neutral-500">
              谁在什么时候做了什么（仅超级管理员可见）
            </p>
          </Link>
        ) : null}

        {isSuperAdmin(user) ? (
          <Link
            href="/admin/seasons"
            className="rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-neutral-900"
          >
            <h2 className="font-semibold">赛季管理</h2>
            <p className="mt-1 text-sm text-neutral-500">
              配置学期起止日期、开启新赛季（仅超级管理员可见）
            </p>
          </Link>
        ) : null}

        <Link
          href="/admin/events"
          className="rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-neutral-900"
        >
          <h2 className="font-semibold">社团活动</h2>
          <p className="mt-1 text-sm text-neutral-500">
            发布赛事、查看报名与候补
          </p>
        </Link>

        <Link
          href="/admin/rating"
          className="rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-neutral-900"
        >
          <h2 className="font-semibold">成绩录入</h2>
          <p className="mt-1 text-sm text-neutral-500">
            录入官方比赛结果，按 ELO 自动结算积分
          </p>
        </Link>
      </div>
    </div>
  );
}