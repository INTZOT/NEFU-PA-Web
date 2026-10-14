/**
 * 网站 → 机器人：请它在群里 @ 某人（D-45）。
 *
 * 为什么由网站发起：网站知道「谁在注册」（它刚收到表单），
 * 机器人知道「怎么在群里说话」。各做各的，不互相复制实现。
 *
 * 失败时**不抛异常**：调用方（注册流程）要据此给用户明确提示，
 * 而不是让一个 500 页面把用户挡在门外。
 */

/** 机器人内部的 HTTP 服务（compose 网络内）。 */
const BOT_INTERNAL_URL = process.env.BOT_INTERNAL_URL ?? "http://bot:8000";

export type MentionKind = "register" | "reset";

export interface MentionResult {
  ok: boolean;
  /** 失败原因，直接展示给用户。 */
  error?: string;
}

export async function requestGroupMention(
  qq: string,
  name: string,
  kind: MentionKind,
): Promise<MentionResult> {
  try {
    const res = await fetch(`${BOT_INTERNAL_URL}/notify/confirm`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.SHARED_RULES_TOKEN ?? ""}`,
      },
      body: JSON.stringify({ qq, name, kind }),
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });

    if (res.ok) return { ok: true };

    // 503 = 协议端没连上。这是最常见、也最需要说清楚的失败。
    if (res.status === 503) {
      return { ok: false, error: "机器人当前不在线，请稍后再试或联系管理员。" };
    }
    return { ok: false, error: "无法通知机器人，请稍后再试。" };
  } catch {
    return { ok: false, error: "无法连接机器人服务，请稍后再试。" };
  }
}
