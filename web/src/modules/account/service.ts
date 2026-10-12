/**
 * 账号与身份模块（P2 模块 B）。
 *
 * 职责：注册、登录、密码校验。
 * 依据：D-12（注册流程）、D-13（邀请码）、D-08（所有权交割）。
 */

import { hashPassword, verifyPassword } from "@/lib/password";
import { normalizeInviteCode } from "@/lib/invite-code";
import { getPool, queryOne } from "@/lib/db";

export interface RegisterInput {
  name: string;
  studentId: string;
  password: string;
  inviteCode: string;
}

export type RegisterResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

const STUDENT_ID_RE = /^[0-9]{10}$/;
const MIN_PASSWORD = 6;

/** 用于「用户不存在」时也执行一次校验，避免通过响应时间判别账号是否存在。 */
const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export async function register(input: RegisterInput): Promise<RegisterResult> {
  const name = input.name.trim();
  const studentId = input.studentId.trim();
  const code = normalizeInviteCode(input.inviteCode);

  // ---- 校验 ----
  if (!name) return { ok: false, error: "请填写姓名" };
  if (!STUDENT_ID_RE.test(studentId)) return { ok: false, error: "学号应为 10 位数字" };
  if (input.password.length < MIN_PASSWORD) return { ok: false, error: "密码至少 " + MIN_PASSWORD + " 位" };
  if (!code) return { ok: false, error: "请填写邀请码" };

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    // 邀请码必须存在且未使用；QQ 号由邀请码带入，用户无从伪造（D-12）
    const invite = await client.query<{ id: string; qq_number: string; used_at: Date | null }>(
      "SELECT id, qq_number, used_at FROM invite_codes WHERE code = $1 FOR UPDATE",
      [code],
    );
    const row = invite.rows[0];
    if (!row) { await client.query("ROLLBACK"); return { ok: false, error: "邀请码无效" }; }
    if (row.used_at) { await client.query("ROLLBACK"); return { ok: false, error: "该邀请码已用于注册" }; }

    const passwordHash = await hashPassword(input.password);

    const created = await client.query<{ id: string }>(
      `INSERT INTO users (name, student_id, qq_number, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [name, studentId, row.qq_number, passwordHash],
    );
    const userId = created.rows[0].id;

    await client.query("UPDATE invite_codes SET used_at = now() WHERE id = $1", [row.id]);

    // 为新用户建立本赛季积分记录（D-09：初始 500）
    await client.query(
      `INSERT INTO season_ratings (user_id, season_id)
       SELECT $1, id FROM seasons WHERE status = 'active' LIMIT 1`,
      [userId],
    );

    await client.query("COMMIT");
    return { ok: true, userId };
  } catch (err) {
    await client.query("ROLLBACK");
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("users_qq_number_key")) return { ok: false, error: "该 QQ 号已注册" };
    if (message.includes("users_student_id_fmt")) return { ok: false, error: "学号格式不正确" };
    throw err;
  } finally {
    client.release();
  }
}

export type LoginResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/** 登录：ident 可以是学号或 QQ 号（D-12 的两种登录方式）。 */
export async function login(ident: string, password: string): Promise<LoginResult> {
  const key = ident.trim();
  if (!key || !password) return { ok: false, error: "请填写账号与密码" };

  const user = await queryOne<{ id: string; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE student_id = $1 OR qq_number = $1 LIMIT 1",
    [key],
  );

  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);

  if (!user || !ok) return { ok: false, error: "账号或密码不正确" };
  return { ok: true, userId: user.id };
}
