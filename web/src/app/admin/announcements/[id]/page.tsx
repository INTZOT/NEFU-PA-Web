import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canEnterAdmin } from "@/lib/roles";
import { getById } from "@/modules/announcement/service";
import { AnnouncementForm } from "@/components/AnnouncementForm";
import { Notice } from "@/components/Notice";

export default async function EditAnnouncementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEnterAdmin(user)) redirect("/me");

  const { id } = await params;
  const { ok, error } = await searchParams;

  const announcement = await getById(id);
  if (!announcement) notFound();

  return (
    <div className="space-y-5">
      <Link
        href="/admin/announcements"
        className="text-sm text-ink-muted hover:text-ink"
      >
        ← 公告列表
      </Link>

      <h1 className="text-xl font-bold">编辑公告</h1>
      <Notice ok={ok} error={error} />

      <div className="rounded-xl border border-line bg-surface p-4">
        <AnnouncementForm
          action={`/api/admin/announcements/${announcement.id}`}
          announcement={announcement}
          submitLabel="保存修改"
        />
      </div>

      <form action={`/api/admin/announcements/${announcement.id}/delete`} method="post">
        <button
          type="submit"
          className="text-sm text-red-600 hover:text-red-800"
        >
          删除这条公告
        </button>
      </form>
    </div>
  );
}
