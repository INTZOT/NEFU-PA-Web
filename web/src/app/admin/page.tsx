import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canEnterAdmin, isSuperAdmin } from "@/lib/roles";
import { BotStatusCard } from "@/components/BotStatusCard";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEnterAdmin(user)) redirect("/me");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">管理后台</h1>
        <p className="mt-1 text-sm text-ink-muted">
          当前登录：{user.name}
        </p>
      </div>

      {/* 机器人状态：**仅超管可见** —— 掉线时这里会出现登录二维码 */}
      {isSuperAdmin(user) ? <BotStatusCard /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/admin/announcements"
          className="rounded-xl border border-line bg-surface p-4 transition hover:border-brand"
        >
          <h2 className="font-semibold">社团公告</h2>
          <p className="mt-1 text-sm text-ink-muted">
            发布与维护公告，首页与公告页展示
          </p>
        </Link>

        <Link
          href="/admin/club"
          className="rounded-xl border border-line bg-surface p-4 transition hover:border-brand"
        >
          <h2 className="font-semibold">社团介绍</h2>
          <p className="mt-1 text-sm text-ink-muted">
            概况、组织架构、章程、联系方式（游客可见）
          </p>
        </Link>

        {isSuperAdmin(user) ? (
          <Link
            href="/admin/members"
            className="rounded-xl border border-line bg-surface p-4 transition hover:border-brand"
          >
            <h2 className="font-semibold">成员与权限</h2>
            <p className="mt-1 text-sm text-ink-muted">
              设置或取消管理员（仅超级管理员可见）
            </p>
          </Link>
        ) : null}

        {isSuperAdmin(user) ? (
          <Link
            href="/admin/audit"
            className="rounded-xl border border-line bg-surface p-4 transition hover:border-brand"
          >
            <h2 className="font-semibold">操作记录</h2>
            <p className="mt-1 text-sm text-ink-muted">
              谁在什么时候做了什么（仅超级管理员可见）
            </p>
          </Link>
        ) : null}

        {isSuperAdmin(user) ? (
          <Link
            href="/admin/seasons"
            className="rounded-xl border border-line bg-surface p-4 transition hover:border-brand"
          >
            <h2 className="font-semibold">赛季管理</h2>
            <p className="mt-1 text-sm text-ink-muted">
              配置学期起止日期、开启新赛季（仅超级管理员可见）
            </p>
          </Link>
        ) : null}

        <Link
          href="/admin/bot-messages"
          className="rounded-lg border border-line bg-surface p-4 transition hover:border-brand"
        >
          <h2 className="font-semibold">机器人文案</h2>
          <p className="mt-1 text-sm text-ink-muted">
            自定义机器人私聊回复的内容（注册、重置密码）
          </p>
        </Link>

        <Link
          href="/admin/home"
          className="rounded-lg border border-line bg-surface p-4 transition hover:border-brand"
        >
          <h2 className="font-semibold">首页文案</h2>
          <p className="mt-1 text-sm text-ink-muted">
            修改首页顶部的大标题与副标题
          </p>
        </Link>

        <Link
          href="/admin/photos"
          className="rounded-lg border border-line bg-surface p-4 transition hover:border-brand"
        >
          <h2 className="font-semibold">社团照片</h2>
          <p className="mt-1 text-sm text-ink-muted">
            上传活动照片、写说明、挑选上首页的精选
          </p>
        </Link>

        <Link
          href="/admin/events"
          className="rounded-xl border border-line bg-surface p-4 transition hover:border-brand"
        >
          <h2 className="font-semibold">社团活动</h2>
          <p className="mt-1 text-sm text-ink-muted">
            发布赛事、查看报名与候补
          </p>
        </Link>

        <Link
          href="/admin/rating"
          className="rounded-xl border border-line bg-surface p-4 transition hover:border-brand"
        >
          <h2 className="font-semibold">成绩录入</h2>
          <p className="mt-1 text-sm text-ink-muted">
            录入官方比赛结果，按 ELO 自动结算积分
          </p>
        </Link>
      </div>
    </div>
  );
}