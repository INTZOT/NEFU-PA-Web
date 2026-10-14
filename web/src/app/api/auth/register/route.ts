import { cookies } from "next/headers";
import { redirectTo } from "@/lib/redirect";
import { startRegistration, echoBack } from "@/modules/account/register-flow";
// ⚠️ cookie 名放在 lib 里，不在这里 export ——
// route.ts 多导出常量会让 Next 的构建类型守卫报错。
import { HANDOFF_COOKIE, HANDOFF_MAX_AGE } from "@/lib/handoff-cookie";

/**
 * 注册第一步（D-45）：校验表单 → 写入待确认 → 请机器人在群里 @ 本人。
 *
 * 成功后跳到「等待确认」页轮询；**此时还没有建号**。
 * 建号发生在机器人群内确认的那一刻（bot 侧完成）。
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const input = {
    name: String(form.get("name") ?? ""),
    studentId: String(form.get("studentId") ?? ""),
    password: String(form.get("password") ?? ""),
    qq: String(form.get("qq") ?? ""),
  };

  // 带上该浏览器上一次的进站凭据：用于判断「是自己重试」还是「别人来抢注」。
  // 用 next/headers 的 cookies()（App Router 里读请求 cookie 的正规方式）。
  const jar = await cookies();
  const previousHandoff = jar.get(HANDOFF_COOKIE)?.value ?? null;

  const result = await startRegistration(input, previousHandoff);

  if (!result.ok) {
    // 回填已填内容，避免用户重打一遍（密码除外 —— 不回填密码）
    const back = echoBack({
      name: input.name,
      studentId: input.studentId,
      qq: input.qq,
    });
    const qs = `error=${encodeURIComponent(result.error)}&${back}`;
    return redirectTo(request, `/register?${qs}`);
  }

  const res = redirectTo(
    request,
    `/register/waiting?qq=${encodeURIComponent(result.qq)}`,
  );

  // 下发进站凭据：只有**发起注册的这个浏览器**能凭它换取登录会话。
  // 少了这一步，「注册完自动进站」就退化成「知道 QQ 号即可接管账号」。
  res.cookies.set(HANDOFF_COOKIE, result.handoff, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: HANDOFF_MAX_AGE,
  });
  return res;
}
