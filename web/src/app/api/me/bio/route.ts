import { getCurrentUser } from "@/lib/session";
import { redirectTo } from "@/lib/redirect";
import { parseBio, updateBio } from "@/modules/profile/service";

/**
 * 保存个人简介。
 *
 * 允许清空（存为 null）—— 简介是可选的，不该强迫填写。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");

  const form = await request.formData();
  const parsed = parseBio(String(form.get("bio") ?? ""));

  if (!parsed.ok) {
    return redirectTo(request, `/me?error=${encodeURIComponent(parsed.error)}`);
  }

  await updateBio(user.id, parsed.value);

  return redirectTo(
    request,
    `/me?ok=${encodeURIComponent(parsed.value === null ? "简介已清空" : "简介已保存")}#bio`,
  );
}
