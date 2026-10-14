/**
 * 过期数据清理。
 *
 * 清哪些、为什么：
 *   1. `pending_registrations` —— **含 scrypt 密码哈希**。确认建号时才会删，
 *      没人确认的行（用户中途放弃、或只是点错了）会**永久留在库里**，
 *      既是无用的凭据副本，也是持续增长的垃圾。
 *   2. `pending_password_resets` —— 已用过的、过期的重置申请。
 *   3. `login_sessions` —— 过期会话行。原来只有登出/改密才会删，
 *      30 天过期的行会永久堆积。
 *
 * 为什么用「惰性清理」而不是定时任务：
 *   本项目是单容器、无 scheduler（服务器只有 1.6G 内存，没必要为此引入 cron 或
 *      额外的 sidecar）。而这些表的写入都发生在少数几个入口（注册/找回密码/登录），
 *   在入口顺带清一次，成本可忽略，效果与定时任务等价 ——
 *   数据只会在「没人再用」时堆积，而那时也没人关心它堆不堆。
 *
 * 频率控制：每个进程最多每 10 分钟真正执行一次（内存标记）。
 *   多实例部署时各实例各清一次也无妨 —— DELETE 是幂等的。
 */

import { query } from "./db";

/** 两次实际清理之间的最小间隔。 */
const INTERVAL_MS = 10 * 60 * 1000;

let lastRun = 0;
let running: Promise<void> | null = null;

/**
 * 清理过期数据。可安全地在任何请求路径里 await ——
 * 它自己会节流，绝大多数调用只是检查一个时间戳就返回。
 *
 * **绝不抛异常**：清理失败不该连累用户正在做的事。
 */
export async function cleanupExpired(): Promise<void> {
  const now = Date.now();
  if (now - lastRun < INTERVAL_MS) return;
  // 并发请求同时到达时只跑一次
  if (running) return running;

  lastRun = now;
  running = (async () => {
    try {
      // 过期的待确认注册（含密码哈希，务必清掉）
      await query(
        "DELETE FROM pending_registrations WHERE expires_at < now() - interval '1 hour'",
      );
      // 过期的/已用过的重置申请
      await query(
        "DELETE FROM pending_password_resets WHERE expires_at < now() - interval '1 hour'",
      );
      // 已过期的登录会话
      await query("DELETE FROM login_sessions WHERE expires_at < now()");
    } catch (err) {
      console.error("[cleanup] 过期数据清理失败（不影响主流程）", err);
    } finally {
      running = null;
    }
  })();

  return running;
}
