/**
 * 登录会话：数据库存会话，浏览器只持有一个随机会话 ID。
 *
 * 依据：
 *   - D-15 明确「重置密码不失效其他设备的登录态」，因此不做批量失效
 *   - 登录方式两种：学号 + 密码，或 QQ 号 + 密码（D-12）
 */

import { randomBytes } from "node:crypto";
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
  const token = randomBytes(32).toString("base64url");
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
