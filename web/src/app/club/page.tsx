import Link from "next/link";
import { listSections, hasContent } from "@/modules/club/service";

export const metadata = {
  title: "社团介绍 · 东北林业大学匹克球社团",
};

export default async function ClubPage() {
  const sections = await listSections();
  const filled = sections.filter(hasContent);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">社团介绍</h1>
        <Link href="/announcements" className="text-sm text-neutral-500 hover:text-neutral-900">
          社团公告 →
        </Link>
      </div>

      {filled.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
          <p className="font-medium text-neutral-800">介绍内容尚未填写</p>
          <p>
            管理员登录后可在「管理 → 社团介绍」中填写概况、组织架构、章程与联系方式。
          </p>
          <p className="text-neutral-500">
            在此之前，你可以先看看
            <Link href="/announcements" className="mx-1 text-blue-600 hover:underline">
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
                className="rounded-lg border border-neutral-200 bg-white p-4"
              >
                <h2 className="font-semibold">{s.title}</h2>
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-neutral-700">
                  {s.content}
                </p>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
