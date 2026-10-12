import { login } from "@/modules/account/service";
import { createSession } from "@/lib/session";
import { redirectTo } from "@/lib/redirect";
import { clearKey, RATE_LIMIT_HEADER } from "@/middleware";

export async function POST(request: Request) {
  const form = await request.formData();
  const result = await login(
    String(form.get("ident") ?? ""),
    String(form.get("password") ?? ""),
  );

  if (!result.ok) {
    // 失败：不作处理，中间件已记过一次（限流靠失败次数累积生效）
    return redirectTo(request, `/login?error=${encodeURIComponent(result.error)}`);
  }

  // 成功：清掉该 IP 的失败计数，避免正常用户偶尔输错几次后被挡在门外
  const key = request.headers.get(RATE_LIMIT_HEADER);
  if (key) clearKey(key);

  await createSession(result.userId);
  return redirectTo(request, "/me");
}
