/**
 * 登录会话：数据库存会话，浏览器只持有一个随机会话 ID。
 *
 * 依据：
 *   - D-15 明确「重置密码不失效其他设备的登录态」—— 其**初衷**是不让人重置一次密码
 *     就在所有设备上被迫重新登录。
 *   - D-33（安全整改）修正了它的**副作用**：原实现让「已被盗的会话」在改密码后依然有效，
 *     攻击者可继续使用最长 30 天。
 *
 * 现在的做法同时满足两者：
 *   改密码时**失效该用户的全部其他会话**，但**保留当前这一次**。
 *   —— 自己的设备不掉线（符合 D-15 初衷），他人的会话被踢（修掉副作用）。
 *
 * 登录方式两种：学号 + 密码，或 QQ 号 + 密码（D-12）。
 */

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { query, queryOne } from "./db";

export const SESSION_COOKIE = "nefu_session";
const SESSION_DAYS = 30;

export interface SessionUser {
  id: string;
  name: string;
  studentId: string;
  qqNumber: string;
  selfRating: number;
  role: "member" | "admin" | "super_admin";
}

interface UserRow {
  id: string;
  name: string;
  student_id: string;
  qq_number: string;
  self_rating: number;
  role: SessionUser["role"];
}

function toSessionUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    name: row.name,
    studentId: row.student_id,
    qqNumber: row.qq_number,
    selfRating: row.self_rating,
    role: row.role,
  };
}

export async function createSession(userId: string): Promise<string> {
  // 会话 id 必须是 uuid：login_sessions.id 的类型就是 uuid。
  // 之前这里用 base64url 随机串，导致登录在写会话时 500
  // （invalid input syntax for type uuid）。
  // 安全性：uuid v4 有 122 位随机性，作为不可猜测的会话标识足够。
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await query(
    "INSERT INTO login_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)",
    [token, userId, expiresAt],
  );

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  return token;
}

/**
 * 失效某用户的全部会话。
 *
 * 用途：密码被改动后使用。密码是账号的唯一凭据，一旦更换，
 * 此前基于旧密码建立的会话就不应再被信任 —— 否则「改密码」这个动作
 * 在安全意义上等于没有发生。
 */
export async function invalidateAllSessions(userId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    "DELETE FROM login_sessions WHERE user_id = $1 RETURNING id",
    [userId],
  );
  return rows.length;
}

/**
 * 失效某用户除当前会话外的全部会话。
 *
 * 用于「用户自己在个人主页改密码」：其他设备被踢下线，当前设备保持登录
 * —— 这是 D-15 初衷（不让人到处重新登录）与安全要求的折中。
 *
 * @param keepToken 要保留的会话 id；省略则等价于 invalidateAllSessions
 */
export async function invalidateOtherSessions(
  userId: string,
  keepToken: string | null,
): Promise<number> {
  if (!keepToken) return invalidateAllSessions(userId);
  const rows = await query<{ id: string }>(
    "DELETE FROM login_sessions WHERE user_id = $1 AND id <> $2 RETURNING id",
    [userId, keepToken],
  );
  return rows.length;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query("DELETE FROM login_sessions WHERE id = $1", [token]);
  jar.delete(SESSION_COOKIE);
}

/** 读取当前登录用户；未登录或会话过期返回 null。 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await queryOne<UserRow>(
    `SELECT u.id, u.name, u.student_id, u.qq_number, u.self_rating, u.role
       FROM login_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now()`,
  
    [token],
  );

  return row ? toSessionUser(row) : null;
}
