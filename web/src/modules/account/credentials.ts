/**
 * 账号凭据的修改：自助换绑与管理员人工兜底。
 *
 * 依据：
 *   - R-27 / D-11：用户可在**个人主页自助换绑**账号凭据（QQ 号、学号），无需管理员审批
 *   - R-42 / D-16：保留**管理员人工兜底通道**，处理「QQ 死局」与「重置失误」
 *     —— 这是本项目**唯一一处主动引入的人工介入**（D-16 明示），是有意识的例外
 *
 * 两者是同一件事的两个入口：换绑逻辑必须只有一份实现，
 * 否则「用户自己改」与「管理员代改」会出现不一致（例如一边查重一边不查）。
 * 因此本模块提供 checkAvailability + applyCredentials，两个入口都调它。
 */

import { query, queryOne, withTransaction } from "@/lib/db";

export interface CredentialChange {
  qqNumber: string;
  studentId: string;
}

export type CredentialResult =
  | { ok: true; changed: string[] }
  | { ok: false; error: string };

/** 学号格式（与注册时一致：10 位数字，如 2025213063）。 */
const STUDENT_ID_RE = /^\d{10}$/;
/** QQ 号格式：5–12 位数字（与实际 QQ 号长度一致）。 */
const QQ_RE = /^\d{5,12}$/;

export function parseCredentials(form: {
  qqNumber: string;
  studentId: string;
}): { ok: true; value: CredentialChange } | { ok: false; error: string } {
  const qqNumber = form.qqNumber.trim();
  const studentId = form.studentId.trim();

  if (!QQ_RE.test(qqNumber)) {
    return { ok: false, error: "QQ 号应为 5–12 位数字" };
  }
  if (!STUDENT_ID_RE.test(studentId)) {
    return { ok: false, error: "学号应为 10 位数字（如 2025213063）" };
  }

  return { ok: true, value: { qqNumber, studentId } };
}

/**
 * 应用凭据修改。
 *
 * 唯一性由数据库的 UNIQUE 约束保证（users.qq_number / users.student_id），
 * 这里先查一次是为了给出**友好的错误信息**，而不是依赖约束报错。
 *
 * @param actorId 操作者（用户本人或管理员）—— 仅用于调用方写操作留痕
 */
export async function applyCredentials(
  userId: string,
  change: CredentialChange,
): Promise<CredentialResult> {
  return withTransaction(async (client) => {
    const current = await client.query<{ qq_number: string; student_id: string }>(
      "SELECT qq_number, student_id FROM users WHERE id = $1 FOR UPDATE",
      [userId],
    );
    const me = current.rows[0];
    if (!me) return { ok: false, error: "账号不存在" };

    const changed: string[] = [];

    if (change.qqNumber !== me.qq_number) {
      const taken = await client.query(
        "SELECT 1 FROM users WHERE qq_number = $1 AND id <> $2",
        [change.qqNumber, userId],
      );
      if (taken.rows.length > 0) {
        return { ok: false, error: "这个 QQ 号已经绑定了其他账号" };
      }
      changed.push(`QQ 号 ${me.qq_number} → ${change.qqNumber}`);
    }

    if (change.studentId !== me.student_id) {
      const taken = await client.query(
        "SELECT 1 FROM users WHERE student_id = $1 AND id <> $2",
        [change.studentId, userId],
      );
      if (taken.rows.length > 0) {
        return { ok: false, error: "这个学号已经绑定了其他账号" };
      }
      changed.push(`学号 ${me.student_id} → ${change.studentId}`);
    }

    if (changed.length === 0) {
      return { ok: false, error: "没有改动" };
    }

    await client.query("UPDATE users SET qq_number = $2, student_id = $3 WHERE id = $1", [
      userId,
      change.qqNumber,
      change.studentId,
    ]);

    return { ok: true, changed };
  });
}

/**
 * 管理员代设密码（D-16 的『重置失误』兜底）。
 *
 * 场景：用户在 QQ 里重置密码时**打错**了新密码（D-15 无二次确认，输错即锁死），
 * 此时他还能发消息，所以通常可以再重置一次；但若已无法操作，
 * 就需要管理员代为设置一个临时密码。
 *
 * 密码散列由调用方通过共享规则取得（与机器人同一条路径），
 * 保证「加密封装」仍只有一份实现。
 */
export async function setPasswordHash(userId: string, hash: string): Promise<void> {
  await query("UPDATE users SET password_hash = $2 WHERE id = $1", [userId, hash]);
}

/** 管理员用：取某人的基本信息（兜底操作前确认是这个人）。 */
export async function getCredentialInfo(userId: string): Promise<{
  name: string;
  qqNumber: string;
  studentId: string;
} | null> {
  const row = await queryOne<{ name: string; qq_number: string; student_id: string }>(
    "SELECT name, qq_number, student_id FROM users WHERE id = $1",
    [userId],
  );
  return row ? { name: row.name, qqNumber: row.qq_number, studentId: row.student_id } : null;
}
