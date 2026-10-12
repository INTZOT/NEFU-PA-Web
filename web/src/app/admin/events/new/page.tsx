import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canEnterAdmin } from "@/lib/roles";
import { EventForm } from "@/components/EventForm";
import { Notice } from "@/components/Notice";

export default async function NewEventPage({
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
      <h1 className="text-xl font-bold">发布活动</h1>
      <Notice error={error} />
      <div className="rounded-xl border border-line bg-surface p-4">
        <EventForm action="/api/admin/events" submitLabel="发布" />
      </div>
    </div>
  );
}
