import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/roles";
import { redirectTo } from "@/lib/redirect";
import { save, MAX_BYTES } from "@/modules/photo/service";
import { record } from "@/modules/audit/service";

/**
 * 上传照片（仅管理员，D-31 第二条）。
 *
 * 压缩在浏览器端完成（D-31 第五条）：手机照片动辄 5–10MB，
 * 服务端重新编码需要在容器里装图像库、显著增大镜像，不值得。
 * 这里只做兜底校验：大小上限 + 文件头（魔数）识别。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");
  if (!isAdmin(user)) return redirectTo(request, "/me");

  const back = "/admin/photos";
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return redirectTo(request, `${back}?error=${encodeURIComponent("请选择图片文件")}`);
  }
  if (file.size > MAX_BYTES) {
    return redirectTo(
      request,
      `${back}?error=${encodeURIComponent(`图片过大（上限 ${Math.round(MAX_BYTES / 1024 / 1024)}MB）`)}`,
    );
  }

  const caption = String(form.get("caption") ?? "").trim() || null;
  const featured = form.get("featured") !== null;

  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await save(bytes, caption, featured, user.id);
  if (!result.ok) {
    return redirectTo(request, `${back}?error=${encodeURIComponent(result.error)}`);
  }

  await record(user, "photo.upload", caption ?? result.photo.filename);

  return redirectTo(
    request,
    `${back}?ok=${encodeURIComponent(featured ? "已上传并设为首页精选" : "已上传")}`,
  );
}
