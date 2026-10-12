import type { SessionUser } from "./session";

/**
 * 角色判断集中在这里，避免各处散落 role === "..." 的比较。
 *
 * 依据：
 *   - D-16：管理员是真实要实现的角色，职责是发布公告活动 + 人工兜底
 *   - 超管继承管理员能力（超管是管理员的超集）
 */

export function isAdmin(user: SessionUser | null): boolean {
  return user?.role === "admin" || user?.role === "super_admin";
}

export function isSuperAdmin(user: SessionUser | null): boolean {
  return user?.role === "super_admin";
}

/** 后台入口在导航里是否显示。 */
export function canEnterAdmin(user: SessionUser | null): boolean {
  return isAdmin(user);
}
