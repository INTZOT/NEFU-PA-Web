/**
 * 角色管理（设置/取消管理员）。
 *
 * 依据 D-16 的权限模型：
 *   超级管理员  预先指定、唯一、可共用   —— 全部权力，**包括设置管理员**
 *   管理员      由超级管理员设置         —— 发布公告与活动、账号人工兜底
 *   成员        注册产生
 *
 * 「设置管理员」是超管的专属能力，因此本模块的每个写操作都必须由超管调用；
 * 调用方（页面/接口）负责鉴权，但本模块也会再校验一次目标对象的合法性。
 */

import { query, queryOne } from "@/lib/db";

export type Role = "member" | "admin" | "super_admin";

export interface MemberRow {
  id: string;
  name: string;
  studentId: string;
  qqNumber: string;
  role: Role;
  createdAt: string;
}

interface Row {
  id: string;
  name: string;
  student_id: string;
  qq_number: string;
  role: Role;
  created_at: string;
}

/** 成员列表。管理员排前面，便于超管一眼看到现状。 */
export async function listMembers(): Promise<MemberRow[]> {
  const rows = await query<Row>(
    `SELECT id, name, student_id, qq_number, role, created_at
       FROM users
      ORDER BY
        CASE role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
        created_at`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    studentId: r.student_id,
    qqNumber: r.qq_number,
    role: r.role,
    createdAt: r.created_at,
  }));
}

export type SetRoleResult = { ok: true } | { ok: false; error: string };

/**
 * 设置某人的角色。
 *
 * 边界处理（保守取向，理由见下）：
 *   - 不能改自己      → 防止超管误操作把自己降级，导致无人能设置管理员
 *   - 不能动超管账号  → 超管是预先指定的唯一角色，转让/新增属未决问题（Q41）
 *   - 目标必须存在
 */
export async function setRole(
  targetUserId: string,
  role: Extract<Role, "member" | "admin">,
  actorUserId: string,
): Promise<SetRoleResult> {
  if (targetUserId === actorUserId) {
    return { ok: false, error: "不能修改自己的角色" };
  }

  const target = await queryOne<{ role: Role; name: string }>(
    "SELECT role, name FROM users WHERE id = $1",
    [targetUserId],
  );
  if (!target) return { ok: false, error: "该成员不存在" };

  if (target.role === "super_admin") {
    return { ok: false, error: "不能修改超级管理员的角色" };
  }

  await query("UPDATE users SET role = $2 WHERE id = $1", [targetUserId, role]);
  return { ok: true };
}
