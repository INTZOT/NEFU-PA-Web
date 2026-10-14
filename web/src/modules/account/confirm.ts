/**
 * 群内确认流程的服务层（D-45）：注册与重置密码。
 *
 * 为什么搬到群聊：机器人**非好友私聊**是腾讯风控的高危模式。
 * 原流程要求成员私聊机器人领邀请码，于是每次注册都产生一次陌生私聊。
 *
 * 安全依据是「双向匹配」：机器人 @ 的**是目标本人**，而 bot 只认
 * **发言者的 QQ 号**。攻击者无法用别人的号在群里发言，因此无法代他人确认。
 *（发言者校验发生在 bot 侧，见 bot/bot/group_handlers.py —— 那是最靠近凭据的地方。）
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { query, queryOne, withTransaction } from "@/lib/db";

/** 待确认有效期。与 bot 侧写入的 interval 必须一致。 */
const TTL_MINUTES = 10;

export type ConfirmStatus = "pending" | "done" | "expired" | "missing";

/**
 * 写入一笔待确认注册。
 *
 * `password_hash` 必须先由调用方算好（`lib/password.hashPassword`）——
 * 密码散列全项目只有一份实现，这是既有原则。
 *
 * 同一 QQ 号重复发起会覆盖旧记录（表上有唯一约束），避免连点刷屏。
 */
export async function createPendingRegistration(input: {
  qq: string;
  name: string;
  studentId: string;
  passwordHash: string;
}): Promise<void> {
  await query(
    `INSERT INTO pending_registrations
            (qq_number, name, student_id, password_hash, expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' minutes')::interval)
     ON CONFLICT (qq_number) DO UPDATE
        SET name = EXCLUDED.name,
            student_id = EXCLUDED.student_id,
            password_hash = EXCLUDED.password_hash,
            created_at = now(),
            expires_at = EXCLUDED.expires_at`,
    [input.qq, input.name, input.studentId, input.passwordHash, String(TTL_MINUTES)],
  );
}

/**
 * 查注册是否已完成。
 *
 * 判据：pending 记录没了、而用户存在 → 说明 bot 已按它建号。
 * 这正是「网站轮询」的实现方式 —— 不需要额外的完成标记。
 */
export async function registrationStatus(qq: string): Promise<ConfirmStatus> {
  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM users WHERE qq_number = $1 LIMIT 1",
    [qq],
  );
  if (existing) return "done";

  const pending = await queryOne<{ expired: boolean }>(
    "SELECT (expires_at < now()) AS expired FROM pending_registrations WHERE qq_number = $1 LIMIT 1",
    [qq],
  );
  if (!pending) return "missing";
  return pending.expired ? "expired" : "pending";
}

/**
 * 写入一笔待确认重置，返回**发起凭据**（给 httpOnly cookie 用）。
 *
 * 返回值是**发起凭据的明文**，由调用方写进 httpOnly cookie ——
 * 库里只存它的 sha256。改密时必须带着它，以此证明「同一个浏览器」。
 *
 * ⚠️ 这个值**绝不进群、绝不入日志**：它等同于「发起者」身份。
 */
export async function createPendingReset(
  userId: string,
  sessionId: string | null,
): Promise<string> {
  // 发起凭据：明文只出现在用户的 httpOnly cookie 里，库里存哈希。
  //
  // ⚠️ 这是方案 B 的关键 —— 改密时要求「带着发起时的 cookie」，
  //    于是「谁发起」与「谁确认」必须是同一个人。
  //    攻击者可以诱导受害者确认，但拿不到受害者浏览器里的 cookie。
  const initiator = randomBytes(24).toString("base64url");
  const initiatorHash = createHash("sha256").update(initiator).digest("hex");

  // 同一用户只允许一笔有效待确认：避免连点后群里出现多条 @
  await query(
    "DELETE FROM pending_password_resets WHERE user_id = $1 AND used_at IS NULL",
    [userId],
  );
  await query(
    `INSERT INTO pending_password_resets (user_id, initiator_hash, session_id, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [userId, initiatorHash, sessionId, String(TTL_MINUTES)],
  );
  return initiator;
}

export interface ResetLookup {
  id: string;
  userId: string;
  sessionId: string | null;
  name: string;
  /** 群里是否已确认。未确认时不能改密。 */
  confirmed: boolean;
}

/**
 * 取该用户当前的重置申请（未用、未过期）。
 *
 * 同时返回 `confirmed` —— 等待页据此决定是继续转圈还是弹出改密表单。
 */
export async function findResetByUser(userId: string): Promise<ResetLookup | null> {
  const row = await queryOne<{
    id: string;
    user_id: string;
    session_id: string | null;
    name: string;
    confirmed: boolean;
  }>(
    `SELECT r.id, r.user_id, r.session_id, u.name, (r.confirmed_at IS NOT NULL) AS confirmed
       FROM pending_password_resets r
       JOIN users u ON u.id = r.user_id
      WHERE r.user_id = $1 AND r.used_at IS NULL AND r.expires_at > now()
      ORDER BY r.created_at DESC LIMIT 1`,
    [userId],
  );
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    name: row.name,
    confirmed: row.confirmed,
  };
}

/**
 * 校验发起凭据（cookie 里的明文）是否与库里存的哈希一致。
 *
 * 用 sha256 而不是 scrypt：这个值是高熵随机串（192 位），不是人类密码，
 * 不存在字典攻击的余地，没有必要用慢哈希。
 */
export function verifyInitiator(plain: string, hashHex: string | null): boolean {
  if (!plain || !hashHex) return false;
  const actual = createHash("sha256").update(plain).digest("hex");
  // 定长比较，避免时序侧信道（此处风险很低，但习惯成自然）
  return actual.length === hashHex.length && timingSafeEqual(Buffer.from(actual), Buffer.from(hashHex));
}

/**
 * 改密：写新密码、标记申请已用、使所有登录会话失效。
 *
 * ⚠️ 调用方**必须**先校验两件事，本函数不再重复校验：
 *   1. 群里已确认（`findResetByUser().confirmed === true`）—— 证明 QQ 号所有权
 *   2. 发起凭据 cookie 与库里的哈希一致（`verifyInitiator`）—— 证明是同一个浏览器
 * 两者缺一不可：只有第 1 条则「谁确认谁就能改」（可被社交工程利用），
 * 只有第 2 条则「谁发起谁就能改」（失去了 QQ 所有权证明）。
 *
 * 三处写操作必须在同一事务里 —— 否则可能出现「密码改了但旧会话还能用」。
 */
export async function applyReset(
  resetId: string,
  userId: string,
  passwordHash: string,
): Promise<void> {
  // ⚠️ 必须用 withTransaction —— 不能裸写 BEGIN/COMMIT。
  // 连接池里每条 query 可能落在不同连接上，裸事务会「在不相关的连接上 BEGIN」，
  // 既不原子，也可能把连接卡在事务里。
  await withTransaction(async (client) => {
    await client.query("UPDATE users SET password_hash = $2 WHERE id = $1", [
      userId,
      passwordHash,
    ]);
    await client.query(
      "UPDATE pending_password_resets SET used_at = now() WHERE id = $1",
      [resetId],
    );
    // 密码是唯一凭据：改了就必须让旧登录态失效
    await client.query("DELETE FROM login_sessions WHERE user_id = $1", [userId]);
  });
}

/** 按 QQ 号找已注册用户（重置流程入口用）。 */
export async function findUserByQq(
  qq: string,
): Promise<{ id: string; name: string } | null> {
  const code = qq.trim();
  if (!/^\d{5,12}$/.test(code)) return null;
  const row = await queryOne<{ id: string; name: string }>(
    "SELECT id, name FROM users WHERE qq_number = $1 LIMIT 1",
    [code],
  );
  return row ?? null;
}

/** 归一化 QQ 号输入（去掉空白与非数字）。 */
export function normalizeQq(input: string): string {
  return input.replace(/\D/g, "");
}
