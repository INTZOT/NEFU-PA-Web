import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { listPublished } from "@/modules/announcement/service";
import { listPublished as listEvents } from "@/modules/event/service";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { listFeatured } from "@/modules/photo/service";
import { HeroCarousel } from "@/components/HeroCarousel";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function HomePage() {
  const user = await getCurrentUser();
  const [announcements, events, photos] = await Promise.all([
    listPublished(3),
    listEvents(),
    listFeatured(6),
  ]);

  const upcoming = events
    .filter((e) => new Date(e.startAt).getTime() > Date.now())
    .slice(0, 3);

  return (
    <div className="space-y-6">
      {/* ---- Hero ---- */}
      <section className="relative overflow-hidden rounded-2xl bg-brand">
        {/* 背景：精选照片轮播（无精选照片时退回纯品牌蓝） */}
        <HeroCarousel filenames={photos.map((p) => p.filename)} />

        {/* 内容放在毛玻璃卡片里：这是压在照片上的文字能看清的关键保障 */}
        {/* 毛玻璃卡片：半透明白 + 模糊背景 + 亮边框，让它明确浮在照片之上 */}
        {/* text-white：卡片里全部用白字。原有的 text-white 在改造中丢失过，导致标题变深色、
            压在照片上不易读。照片上的文字用白字是最稳的选择。 */}
        <div className="relative m-4 flex min-h-[19rem] items-center rounded-2xl border border-white/30 bg-white/15 p-6 text-white shadow-[0_8px_32px_rgba(0,0,0,0.25)] backdrop-blur-lg sm:m-6 sm:min-h-[21rem] sm:p-8">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <img
            src="/logo-192.png"
            alt="东北林业大学匹克球协会 logo"
            width={112}
            height={112}
            className="h-24 w-24 shrink-0 drop-shadow-lg sm:h-28 sm:w-28"
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              东北林业大学匹克球协会
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/90 sm:text-base">
              欢迎加入匹克球协会。这里发布社团公告与活动信息；成员登录后可使用约球大厅、
              活动报名与积分排行。
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {user ? (
                <>
                  <ButtonLink href="/rooms" className="!bg-surface !text-brand hover:!bg-surface/90">
                    去约球
                  </ButtonLink>
                  <ButtonLink
                    href="/me"
                    className="!border-white/40 !bg-transparent !text-white hover:!border-white"
                  >
                    个人主页
                  </ButtonLink>
                </>
              ) : (
                <>
                  <ButtonLink
                    href="/register"
                    className="!bg-surface !text-brand hover:!bg-surface/90"
                  >
                    我有邀请码，去注册
                  </ButtonLink>
                  <ButtonLink
                    href="/login"
                    className="!border-white/40 !bg-transparent !text-white hover:!border-white"
                  >
                    已注册，去登录
                  </ButtonLink>
                </>
              )}
            </div>
          </div>
          </div>
        </div>
      </section>

      {/* ---- 未登录时的加入说明 ---- */}
      {!user ? (
        <Card className="p-5">
          <h2 className="font-semibold text-ink">怎么加入？</h2>
          <ol className="mt-3 space-y-2 text-sm text-ink-muted">
            {[
              "在 QQ 群内私聊社团机器人，发送「注册」两个字。",
              "机器人会给你一串专属邀请码（不要转发给别人）。",
              "带着邀请码到本站注册，QQ 号会自动带入，无需填写。",
            ].map((text, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-ink">
                  {i + 1}
                </span>
                <span className="pt-0.5">{text}</span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {/* ---- 精选照片（D-31：管理员在后台勾选「首页精选」）---- */}
      {photos.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">社团风采</h2>
            <Link href="/gallery" className="text-sm text-brand transition hover:underline">
              全部照片 →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p) => (
              <Link
                key={p.id}
                href="/gallery"
                className="group overflow-hidden rounded-xl border border-line bg-surface transition hover:-translate-y-0.5 hover:border-brand hover:shadow-[0_6px_16px_rgba(0,116,203,0.12)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/photos/${p.filename}`}
                  alt={p.caption ?? "社团照片"}
                  loading="lazy"
                  className="aspect-[4/3] w-full bg-surface-muted object-cover"
                />
                {p.caption ? (
                  <p className="truncate px-2.5 py-2 text-xs text-ink-muted">{p.caption}</p>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---- 最新公告 ---- */}
      {announcements.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">最新公告</h2>
            <Link href="/announcements" className="text-sm text-brand transition hover:underline">
              全部公告 →
            </Link>
          </div>
          <div className="space-y-3">
            {announcements.map((a) => (
              <Card key={a.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  {a.isPinned ? <Badge tone="accent">置顶</Badge> : null}
                  {a.category ? <Badge tone="info">{a.category}</Badge> : null}
                  <h3 className="font-medium text-ink">
                    <Link href={`/announcements/${a.id}`} className="transition hover:text-brand">
                      {a.title}
                    </Link>
                  </h3>
                </div>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed whitespace-pre-wrap text-ink-muted">
                  {a.content}
                </p>
                <p className="mt-2 text-xs text-ink-subtle">{formatDate(a.publishedAt)}</p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---- 近期活动 ---- */}
      {upcoming.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">近期活动</h2>
            <Link href="/events" className="text-sm text-brand transition hover:underline">
              全部活动 →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {upcoming.map((e) => (
              <Card key={e.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={e.format === "doubles" ? "info" : "muted"}>
                    {e.format === "doubles" ? "双打" : "单打"}
                  </Badge>
                  {e.remaining > 0 ? (
                    <Badge tone="ok">还剩 {e.remaining}</Badge>
                  ) : (
                    <Badge tone="warn">已满</Badge>
                  )}
                </div>
                <h3 className="mt-2 font-medium text-ink">
                  <Link href={`/events/${e.id}`} className="transition hover:text-brand">
                    {e.title}
                  </Link>
                </h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {formatDate(e.startAt)}
                  {e.location ? ` · ${e.location}` : ""}
                </p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}