/**
 * 重置密码流程（D-45 方案 B）：网站发起 → 群内 @ 确认 → **同浏览器就地改密**。
 *
 * 为什么确认放在群里：机器人**非好友私聊**是腾讯风控的高危模式。
 *
 * 两层安全依据，**缺一不可**：
 *   1. 群内 @ 的是**目标本人**，且 bot 只认**发言者的 QQ 号**
 *      → 证明「回复的人拥有那个 QQ 号」。
 *   2. 改密要求带着**发起重置时下发的 httpOnly cookie**
 *      → 证明「发起的人与确认的人是同一个浏览器」。
 *
 * 第 2 条是为堵一个真实的社交工程路径：
 *   攻击者发起重置，再诱导被 @ 的人「看到提醒就顺手回复确认」。
 *   若只靠第 1 条，攻击者就借他人之手完成了授权；
 *   加上第 2 条后，攻击者拿不到受害者浏览器里的 cookie，仍然改不了密码。
 */

import { query, queryOne } from "@/lib/db";
import { createPendingReset } from "@/modules/account/confirm";
import { requestGroupMention } from "@/modules/bot/notify";

/** 同一 QQ 号发起重置的最小间隔（秒）。防刷屏，也防被用来骚扰别人。 */
const THROTTLE_SECONDS = 300;

export type ResetStartResult =
  /** `initiator` 非空时要写进 httpOnly cookie —— 改密靠它证明「同一个浏览器」。 */
  | { ok: true; initiator?: string }
  | { ok: false; error: string };

/**
 * 第一步：按 QQ 号发起重置，请机器人在群里 @ 本人。
 *
 * ⚠️ 无论该 QQ 号是否已注册，都返回同一句提示 —— 否则这个接口就成了
 *    「批量探测哪些 QQ 号是社团成员」的工具。
 */
export async function startReset(rawQq: string): Promise<ResetStartResult> {
  const qq = rawQq.replace(/\D/g, "");
  if (!/^[0-9]{5,12}$/.test(qq)) {
    return { ok: false, error: "请填写正确的 QQ 号（5~12 位数字）" };
  }

  const user = await queryOne<{ id: string; name: string }>(
    "SELECT id, name FROM users WHERE qq_number = $1 LIMIT 1",
    [qq],
  );

  // 未注册：不透露，直接当作已受理（不 @ 任何人，因为群里 @ 不到无关的人）
  if (!user) return { ok: true };

  // 注意顺序：节流命中时也**不发新 cookie** ——
  // 否则用户反复提交会把已有申请的发起凭据覆盖掉，反而改不了密码。

  // 节流：同一用户 5 分钟内只能发起一次
  const recent = await queryOne<{ id: string }>(
    `SELECT id FROM pending_password_resets
      WHERE user_id = $1 AND created_at > now() - ($2 || ' seconds')::interval
      LIMIT 1`,
    [user.id, String(THROTTLE_SECONDS)],
  );
  if (recent) return { ok: true };

  const initiator = await createPendingReset(user.id, null);

  const mention = await requestGroupMention(qq, user.name, "reset");
  if (!mention.ok) return { ok: false, error: mention.error ?? "无法通知机器人" };

  return { ok: true, initiator };
}

/**
 * 轮询重置申请的状态。
 *
 * - `pending`   已受理（或尚未受理），等群内确认
 * - `confirmed` 群里已确认 → 前端就地弹出改密表单
 * - `none`      输入格式非法
 *
 * ⚠️ 这里**刻意不区分「该 QQ 号是否已注册」**。
 *
 * 原因：这是无认证的公开接口。若「未注册」与「已注册但未确认」返回不同值，
 * 它就成了**批量枚举社团成员 QQ 号**的工具 —— 而这正是发起重置时
 * 特意做「未注册也返回成功」要防的事。之前只做了发起侧、漏了轮询侧，
 * 等于白防（已实测确认可区分：none vs pending）。
 *
 * 未注册时返回 `pending` 是安全的：它永远变不成 `confirmed`，
 * 用户看到的就是「一直在等待确认」，与「确实没注册」的观感一致。
 */
export async function resetStatus(
  rawQq: string,
): Promise<"none" | "pending" | "confirmed"> {
  const qq = rawQq.replace(/\D/g, "");
  if (!/^[0-9]{5,12}$/.test(qq)) return "none";

  const row = await queryOne<{ confirmed: boolean }>(
    `SELECT (r.confirmed_at IS NOT NULL) AS confirmed
       FROM pending_password_resets r
       JOIN users u ON u.id = r.user_id
      WHERE u.qq_number = $1 AND r.used_at IS NULL AND r.expires_at > now()
      ORDER BY r.created_at DESC LIMIT 1`,
    [qq],
  );
  // 没有记录（未注册 / 已过期 / 还没发起）→ 一律当作「等待中」，不泄露区别
  if (!row) return "pending";
  return row.confirmed ? "confirmed" : "pending";
}

/** 清理：过期且未使用的重置记录（由轮询顺带触发，避免额外的定时任务）。 */
export async function purgeExpired(): Promise<void> {
  await query("DELETE FROM pending_password_resets WHERE expires_at < now() - interval '1 day'");
}
