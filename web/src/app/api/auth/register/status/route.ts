import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser, createSession } from "@/lib/session";
import {
  consumeRegistrationHandoff,
  registrationStatus,
} from "@/modules/account/confirm";
import { HANDOFF_COOKIE } from "@/lib/handoff-cookie";

/**
 * 轮询：注册是否已由群内确认完成（D-45）。
 *
 * ⚠️ 这里曾经有一个**严重漏洞**（已实测确认并修复，见迁移 026）：
 *
 *   旧实现用 `registrationStatus(qq)` 判断完成，而它的判据是
 *   「users 表里存在这个 QQ 号」—— **所有老用户都满足**。
 *   于是 `GET /api/auth/register/status?qq=<任意已注册QQ>` 这一个
 *   无需任何凭据的请求，就会为那个账号签发登录会话。
 *   任何知道成员 QQ 号的人（群里天天 @）都能直接接管账号，含 super_admin。
 *
 * 修法：自动进站必须能**证明「你刚完成这次注册」**——
 *   发起注册时下发 httpOnly 的 handoff 凭据，机器人确认建号时把它的哈希
 *   复制到该用户上（10 分钟有效），这里校验通过才建会话并用后即焚。
 *   「用户存在」不再是凭据。
 *
 * 这也顺带修掉了「可枚举某 QQ 号是否已注册」：没有待确认记录时一律回 pending。
 */
export async function GET(request: Request) {
  const qq = new URL(request.url).searchParams.get("qq") ?? "";
  const pendingAnswer = () =>
    NextResponse.json(
      { status: "pending" },
      { headers: { "cache-control": "no-store" } },
    );

  if (!/^[0-9]{5,12}$/.test(qq)) return pendingAnswer();

  const jar = await cookies();
  const handoff = jar.get(HANDOFF_COOKIE)?.value ?? "";

  // 分两种情况，别让用户卡在转圈上：
  //   * 带了凭据但已失效（超时/被清理）→ 明确回 expired，前端提示重新发起；
  //   * 没带凭据 → 一律 pending。因为这是无认证的公开接口，
  //     回答「expired」会泄露「该 QQ 号是否已注册」（老用户必然是 expired）。
  if (handoff) {
    const status = await registrationStatus(qq);
    if (status === "expired") {
      return NextResponse.json(
        { status: "expired" },
        { headers: { "cache-control": "no-store" } },
      );
    }
  } else {
    return pendingAnswer();
  }

  const userId = await consumeRegistrationHandoff(qq, handoff);
  if (!userId) return pendingAnswer();

  // 凭据有效 → 建立登录会话（这就是用户「注册完自动进站」的那一步）
  const current = await getCurrentUser();
  if (!current) await createSession(userId);

  const res = NextResponse.json(
    { status: "done" },
    { headers: { "cache-control": "no-store" } },
  );
  // 用后即焚，避免凭据被重放
  res.cookies.delete(HANDOFF_COOKIE);
  return res;
}
