import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canEnterAdmin } from "@/lib/roles";
import { listSections } from "@/modules/club/service";
import { Notice } from "@/components/Notice";

export default async function ClubAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEnterAdmin(user)) redirect("/me");

  const { ok, error } = await searchParams;
  const sections = await listSections();

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← 管理后台
        </Link>
        <h1 className="mt-1 text-xl font-bold">社团介绍</h1>
        <p className="mt-1 text-sm text-neutral-500">
          这四块内容会展示在
          <Link href="/club" className="mx-1 text-blue-600 hover:underline">
            /club
          </Link>
          ，游客可见。留空的部分不会显示。
        </p>
      </div>

      <Notice ok={ok} error={error} />

      <div className="space-y-4">
        {sections.map((s) => (
          <form
            key={s.slug}
            action={`/api/admin/club/${s.slug}`}
            method="post"
            className="rounded-lg border border-neutral-200 bg-white p-4"
          >
            <label className="block font-semibold" htmlFor={s.slug}>
              {s.title}
            </label>
            <textarea
              id={s.slug}
              name="content"
              rows={6}
              defaultValue={s.content}
              placeholder={`填写${s.title}…（换行会原样保留）`}
              className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                type="submit"
                className="rounded bg-neutral-900 px-4 py-2 text-sm text-white"
              >
                保存{s.title}
              </button>
              {s.content.trim() ? (
                <span className="text-xs text-neutral-400">
                  上次更新 {new Date(s.updatedAt).toLocaleDateString("zh-CN")}
                </span>
              ) : (
                <span className="text-xs text-neutral-400">尚未填写</span>
              )}
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}
