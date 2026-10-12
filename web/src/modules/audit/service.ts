/**
 * 操作记录（审计日志）。
 *
 * 依据 Q41 的答复：超管账号**多人共用**、用户接受「操作无法追溯到具体的人」，
 * 但要求对管理动作**留痕**。因此本模块记录「哪个账号在什么时候做了什么」。
 *
 * 重要：写日志**不能影响主流程**。若审计写入失败导致「设置管理员」失败，
 *       那是本末倒置。故 record() 内部吞掉异常，只打印错误。
 */

import { query } from "@/lib/db";

export type AuditAction =
  | "role.grant"
  | "role.revoke"
  | "announcement.create"
  | "announcement.update"
  | "announcement.delete";

export interface AuditEntry {
  id: string;
  actorName: string;
  action: AuditAction;
  detail: string | null;
  createdAt: string;
}

interface Row {
  id: string;
  actor_name: string;
  action: AuditAction;
  detail: string | null;
  created_at: string;
}

/**
 * 记一条操作。
 *
 * actorName 是**快照**：账号改名或删除后，历史记录仍应显示当时的名字。
 */
export async function record(
  actor: { id: string; name: string },
  action: AuditAction,
  detail: string,
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (actor_user_id, actor_name, action, detail)
       VALUES ($1, $2, $3, $4)`,
      [actor.id, actor.name, action, detail],
    );
  } catch (error) {
    // 审计失败不应影响业务操作本身
    console.error("[audit] 写入操作记录失败：", error);
  }
}

export async function listRecent(limit = 100): Promise<AuditEntry[]> {
  const rows = await query<Row>(
    `SELECT id, actor_name, action, detail, created_at
       FROM audit_logs
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    actorName: r.actor_name,
    action: r.action,
    detail: r.detail,
    createdAt: r.created_at,
  }));
}

/** 动作标识 → 中文标签，供界面展示。 */
export const ACTION_LABEL: Record<AuditAction, string> = {
  "role.grant": "设为管理员",
  "role.revoke": "取消管理员",
  "announcement.create": "发布公告",
  "announcement.update": "修改公告",
  "announcement.delete": "删除公告",
};
