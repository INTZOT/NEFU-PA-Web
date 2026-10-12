import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { getById, remove, setFeatured, updateCaption } from "@/modules/photo/service";
import { record } from "@/modules/audit/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");
  if (!isAdmin(user)) return redirectTo(request, "/me");

  const { id } = await params;
  const back = "/admin/photos";
  const photo = await getById(id);
  if (!photo) return redirectTo(request, `${back}?error=${encodeURIComponent("照片不存在")}`);

  const form = await request.formData();
  const action = String(form.get("action") ?? "");

  if (action === "delete") {
    await remove(id);
    await record(user, "photo.delete", photo.caption ?? photo.filename);
    return redirectTo(request, `${back}?ok=${encodeURIComponent("已删除")}`);
  }

  if (action === "toggle-featured") {
    await setFeatured(id, !photo.isFeatured);
    return redirectTo(
      request,
      `${back}?ok=${encodeURIComponent(photo.isFeatured ? "已取消精选" : "已设为首页精选")}`,
    );
  }

  if (action === "caption") {
    const caption = String(form.get("caption") ?? "").trim() || null;
    await updateCaption(id, caption);
    await record(user, "photo.update", caption ?? photo.filename);
    return redirectTo(request, `${back}?ok=${encodeURIComponent("说明已保存")}`);
  }

  return redirectTo(request, `${back}?error=${encodeURIComponent("未知操作")}`);
}
