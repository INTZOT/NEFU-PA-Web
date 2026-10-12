import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canEnterAdmin } from "@/lib/roles";
import { AnnouncementForm } from "@/components/AnnouncementForm";
import { Notice } from "@/components/Notice";

export default async function NewAnnouncementPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEnterAdmin(user)) redirect("/me");

  const { error } = await searchParams;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">新建公告</h1>
      <Notice error={error} />
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <AnnouncementForm action="/api/admin/announcements" submitLabel="发布" />
      </div>
    </div>
  );
}
