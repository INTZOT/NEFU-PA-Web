import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { saveSection, CLUB_SECTIONS } from "@/modules/club/service";
import { record } from "@/modules/audit/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");
  if (!isAdmin(user)) return redirectTo(request, "/me");

  const { slug } = await params;
  const section = CLUB_SECTIONS.find((s) => s.slug === slug);
  if (!section) {
    return redirectTo(request, `/admin/club?error=${encodeURIComponent("未知的内容块")}`);
  }

  const form = await request.formData();
  const content = String(form.get("content") ?? "");

  await saveSection(section.slug, content, user.id);
  await record(user, "club.update", section.title);

  return redirectTo(request, `/admin/club?ok=${encodeURIComponent(`${section.title}已保存`)}`);
}
