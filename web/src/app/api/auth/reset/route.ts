import { cookies } from "next/headers";
import { redirectTo } from "@/lib/redirect";
import { queryOne } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import {
  applyReset,
  findResetByUser,
  findUserByQq,
  verifySecret,
} from "@/modules/account/confirm";

/** 发起凭据的 cookie 名。httpOnly，前端脚本读不到。 */
const INITIATOR_COOKIE = "nefu_reset_initiator";

/**
 * 改密（D-45 方案 B）。**不接受任何令牌参数** —— 凭据全部来自 cookie。
 *
 * 校验两点，缺一不可：
 *   1. 群里已确认（证明 **QQ 号所有权**）
 *   2. 发起凭据 cookie 与库里的哈希一致（证明 **同一个浏览器**）
 *
 * 这样攻击者即便诱导受害者确认，也因拿不到受害者浏览器里的 cookie 而改不了密码。
 */
const MIN_PASSWORD = 6;

export async function POST(request: Request) {
  const form = await request.formData();
  const qq = String(form.get("qq") ?? "").replace(/\D/g, "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  // ⚠️ 用 redirectTo 而不是 new URL(..., request.url)：后者会把握手后的用户
  //    送到容器内地址（http://0.0.0.0:3000）。项目里踩过不止一次。
  const back = (msg: string) =>
    redirectTo(request, `/forgot/waiting?qq=${qq}&error=${encodeURIComponent(msg)}`);

  if (password.length < MIN_PASSWORD) return back(`密码至少 ${MIN_PASSWORD} 位`);
  if (password !== confirm) return back("两次输入的密码不一致");

  const user = await findUserByQq(qq);
  if (!user) return back("找不到该账号");

  const pending = await findResetByUser(user.id);
  if (!pending) return back("重置申请已超时，请重新发起");
  if (!pending.confirmed) {
    return back("还没有在群里确认，请先到群里回复「确认重置」");
  }

  // 发起凭据校验：必须在**发起重置的那个浏览器**里操作
  const jar = await cookies();
  const initiator = jar.get(INITIATOR_COOKIE)?.value ?? "";
  const stored = await queryOne<{ initiator_hash: string | null }>(
    "SELECT initiator_hash FROM pending_password_resets WHERE id = $1",
    [pending.id],
  );
  if (!verifySecret(initiator, stored?.initiator_hash ?? null)) {
    return back("请回到发起重置的那个浏览器里完成改密");
  }

  const passwordHash = await hashPassword(password);
  await applyReset(pending.id, user.id, passwordHash);

  // 改密成功：清掉发起凭据，并**不自动登录** —— 让他用新密码登一次，
  // 从而确认新密码确实可用（所有旧会话已在 applyReset 里失效）。
  const res = redirectTo(request, "/login?ok=1");
  res.cookies.delete(INITIATOR_COOKIE);
  return res;
}
