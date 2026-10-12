import Link from "next/link";
import { listSections, hasContent } from "@/modules/club/service";
import { listFeatured } from "@/modules/photo/service";

export const metadata = {
  title: "社团介绍",
};

export default async function ClubPage() {
  const [sections, photos] = await Promise.all([listSections(), listFeatured(6)]);
  const filled = sections.filter(hasContent);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">社团介绍</h1>
        <Link href="/announcements" className="text-sm text-ink-muted hover:text-ink">
          社团公告 →
        </Link>
      </div>

      {filled.length === 0 ? (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-6 text-sm text-ink-muted">
          <p className="font-medium text-ink">介绍内容尚未填写</p>
          <p>
            管理员登录后可在「管理 → 社团介绍」中填写概况、组织架构、章程与联系方式。
          </p>
          <p className="text-ink-muted">
            在此之前，你可以先看看
            <Link href="/announcements" className="mx-1 text-brand hover:underline">
              社团公告
            </Link>
            。
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sections
            .filter(hasContent)
            .map((s) => (
              <section
                key={s.slug}
                className="rounded-xl border border-line bg-surface p-4"
              >
                <h2 className="font-semibold">{s.title}</h2>
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-ink">
                  {s.content}
                </p>
              </section>
            ))}
        </div>
      )}
      {photos.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-semibold text-ink">社团风采</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p) => (
              <Link
                key={p.id}
                href="/gallery"
                className="overflow-hidden rounded-xl border border-line bg-surface transition hover:-translate-y-0.5 hover:border-brand"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/photos/${p.filename}`}
                  alt={p.caption ?? "社团照片"}
                  loading="lazy"
                  className="aspect-[4/3] w-full bg-surface-muted object-cover"
                />
              </Link>
            ))}
          </div>
          <Link href="/gallery" className="inline-block text-sm text-brand transition hover:underline">
            查看全部照片 →
          </Link>
        </section>
      ) : null}

    </div>
  );
}