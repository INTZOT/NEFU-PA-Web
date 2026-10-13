/**
 * 站内消息通知（D-43）。
 *
 * 解决什么：约球被申请、申请被审批、活动报名被审核、被设为管理员 ——
 * 这些事件的当事人原本无从知晓，只能靠自己反复刷页面碰运气。
 *
 * 为什么只做站内（不经 QQ）：机器人主动发消息是账号风控的高危行为，
 * 本项目已有账号被限制的实测经历；且此前已明确拒绝主动推送（D-14）。
 *
 * 设计原则（与 audit 模块一致）：**写通知不能影响主流程**。
 * 若通知失败导致「审批通过」失败，那是本末倒置。故 record() 吞掉异常。
 */

import { query, queryOne } from "@/lib/db";

/** 事件类型。新增事件时在这里加一项，并在 TEMPLATES 里给出文案。 */
export type NotificationKind =
  | "room.applied" // 有人申请加入你的约球
  | "room.decided" // 你申请的约球被通过/拒绝
  | "room.withdrawn" // 申请人撤销了申请
  | "room.cancelled" // 你已加入的约球被取消
  | "room.expired" // 你的约球到期关闭
  | "event.promoted" // 候补被自动递补为正式报名
  | "event.released" // 搭档取消导致你的名额被一并释放
  | "role.changed"; // 你的角色被调整

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotifyInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
  /**
   * 去重键：同一用户、同一键、在 DEDUPE_WINDOW_MINUTES 内只保留一条。
   *
   * 用于「一个约球被多人申请」这类会连着来一串的事件 ——
   * 发起人不需要收到 5 条几乎一样的通知。
   * 传 null（默认）表示不去重。
   */
  dedupeKey?: string | null;
}

/** 去重窗口。取 30 分钟：足够把一阵密集申请合并，又不至于漏掉后续消息。 */
const DEDUPE_WINDOW_MINUTES = 30;

/**
 * 创建一条通知。
 *
 * **不抛异常** —— 通知是附带的，失败不该连累业务操作。
 * 但会打印错误：静默丢弃会让「为什么没收到通知」无从排查。
 */
export async function record(input: NotifyInput): Promise<void> {
  try {
    if (input.dedupeKey) {
      const dup = await queryOne<{ id: string }>(
        `SELECT id FROM notifications
          WHERE user_id = $1
            AND dedupe_key = $2
            AND created_at > now() - ($3 || ' minutes')::interval
          LIMIT 1`,
        [input.userId, input.dedupeKey, String(DEDUPE_WINDOW_MINUTES)],
      );
      if (dup) return;
    }

    await query(
      `INSERT INTO notifications (user_id, kind, title, body, link, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.userId,
        input.kind,
        input.title,
        input.body ?? null,
        input.link ?? null,
        input.dedupeKey ?? null,
      ],
    );
  } catch (err) {
    console.error("[notification] 写入失败（不影响主流程）", err);
  }
}

/** 未读数。导航栏红点用，每次页面渲染都会调，故走部分索引。 */
export async function unreadCount(userId: string): Promise<number> {
  try {
    const row = await queryOne<{ n: string }>(
      "SELECT count(*)::text AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL",
      [userId],
    );
    return Number(row?.n ?? 0);
  } catch (err) {
    // 红点取不到不该让整页崩掉 —— 退化为「没有未读」
    console.error("[notification] 未读数查询失败", err);
    return 0;
  }
}

/** 列表（时间倒序）。 */
export async function list(
  userId: string,
  limit = 50,
): Promise<NotificationRow[]> {
  const rows = await query<{
    id: string;
    kind: string;
    title: string;
    body: string | null;
    link: string | null;
    read_at: string | null;
    created_at: string;
  }>(
    `SELECT id, kind, title, body, link, read_at, created_at
       FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    link: r.link,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));
}

/**
 * 标记单条已读。
 *
 * 带 user_id 条件：通知 id 是 uuid，但也不能让 A 标记 B 的通知
 * （与成员主页同理，越权检查放在 SQL 里最稳）。
 */
export async function markRead(userId: string, id: string): Promise<void> {
  await query(
    "UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL",
    [id, userId],
  );
}

/** 全部标记已读。 */
export async function markAllRead(userId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    "UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL RETURNING id",
    [userId],
  );
  return rows.length;
}
