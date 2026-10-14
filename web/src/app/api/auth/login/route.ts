import { login } from "@/modules/account/service";
import { createSession } from "@/lib/session";
import { redirectTo } from "@/lib/redirect";
import { isSameSiteRequest } from "@/lib/same-site";
import { cleanupExpired } from "@/lib/cleanup";
import { clearKey, RATE_LIMIT_HEADER } from "@/middleware";

export async function POST(request: Request) {
  // ⚠️ 登录是**唯一**一个「不需要 cookie 就能成功」的写接口，
  //    因此 sameSite=lax 挡不住它：跨站表单可以把访客登入攻击者的账号。
  //    这里补一道同站校验（见 lib/same-site.ts 的说明）。
  if (!isSameSiteRequest(request)) {
    return redirectTo(
      request,
      `/login?error=${encodeURIComponent("请求来源异常，请直接在本站登录")}`,
    );
  }

  // 顺带清一次过期会话（登录是会话相关的高频入口）
  await cleanupExpired();

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
