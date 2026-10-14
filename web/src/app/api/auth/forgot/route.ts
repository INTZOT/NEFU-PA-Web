import { redirectTo } from "@/lib/redirect";
import { cleanupExpired } from "@/lib/cleanup";
import { startReset } from "@/modules/account/reset-flow";

/**
 * 忘记密码第一步（D-45 方案 B）：请机器人在群里 @ 本人确认。
 *
 * 这里**同时下发一个 httpOnly cookie**（发起凭据）——
 * 改密时要求带着它，从而保证「谁发起」与「谁确认」是同一个人。
 * 攻击者可以诱导受害者确认，但拿不到受害者浏览器里的 cookie。
 *
 * ⚠️ 跳转一律走 `redirectTo`：直接 `new URL(path, request.url)` 会把握手后的用户
 *    送到容器内地址（http://0.0.0.0:3000）。这个坑在项目里踩过不止一次。
 */
const INITIATOR_COOKIE = "nefu_reset_initiator";
/** cookie 有效期与待确认 TTL 对齐（10 分钟），再留一点余量。 */
const COOKIE_MAX_AGE = 15 * 60;

export async function POST(request: Request) {
  const form = await request.formData();
  const rawQq = String(form.get("qq") ?? "");

  // 顺带清一次过期数据（找回密码同样会产生待确认记录）
  await cleanupExpired();

  const result = await startReset(rawQq);
  const qq = rawQq.replace(/\D/g, "");

  if (!result.ok) {
    return redirectTo(request, `/forgot?error=${encodeURIComponent(result.error)}`);
  }

  // 无论该号是否注册，都进同一个等待页 —— 不泄露「这个 QQ 号是否已注册」
  const res = redirectTo(request, `/forgot/waiting?qq=${qq}`);

  if (result.initiator) {
    res.cookies.set(INITIATOR_COOKIE, result.initiator, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  }
  return res;
}
