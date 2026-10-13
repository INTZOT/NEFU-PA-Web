/**
 * 机器人运行状态（供管理面板使用）。
 *
 * 为什么需要它：
 *   机器人曾停摆近 4 小时而无人察觉 —— 因为没有任何地方能看到它的状态。
 *   而 bot 原先的 /healthz **永远返回 200**，那个健康检查是假的。
 *
 * 状态从哪来：
 *   - **连接状态**：唯一真相源是 bot 与协议端之间 WebSocket 的连接，由 bot 上报。
 *   - **当前用哪个协议端**：由宿主机上的看门狗探测并写入状态文件。
 *     网站跑在容器里，无法自行知道哪个协议端容器在运行。
 *
 * 登录态无法直接查询，只能**旁证**：
 *   协议端等待扫码时会持续把新二维码写到文件。
 *   因此「未连接 + 二维码是新的」基本可以断定是掉登录、且现在就能扫。
 *   两个协议端的落盘位置不同，故路径按当前协议端选择。
 */

import { readFile, stat } from "node:fs/promises";

const BOT_HEALTH_URL = process.env.BOT_HEALTH_URL ?? "http://bot:8000";

/**
 * 两种协议端各自的二维码落盘路径。
 *
 * 项目里同时有 LLBot 与 NapCat，**同一时间只启用一个**：
 *   - NapCat 写到 /app/napcat/cache/qrcode.png
 *   - LLBot  写到 <data>/temp/login-qrcode.png
 *
 * 该读哪个由看门狗状态里的 activeService 决定。
 */
const QR_PATHS: Record<string, string> = {
  napcat: process.env.NAPCAT_QR_PATH ?? "/app/napcat-cache/qrcode.png",
  llbot: process.env.LLBOT_QR_PATH ?? "/app/llbot-cache/temp/login-qrcode.png",
};

// 宿主机看门狗写的状态文件（只读挂载）。读不到就当作没有装看门狗。
const WATCHDOG_STATE_PATH =
  process.env.WATCHDOG_STATE_PATH ?? "/app/watchdog-state/protocol-watchdog.json";

/** 超过这个时长没更新的二维码视为过期（协议端约每 2 分钟写一次）。 */
const QR_FRESH_MS = 5 * 60 * 1000;

export interface BotStatus {
  /** 协议端是否已连接到 bot。 */
  connected: boolean;
  /** 是否查到了 bot 的状态接口。查不到 = bot 本身可能没起来。 */
  reachable: boolean;
  /** 当前在用的协议端（napcat / llbot）。看门狗未上报时为 null。 */
  activeService: string | null;
  /**
   * 登录态是否已被服务端作废。
   *
   * ⚠️ 这一项与 connected **不是一回事**，必须分开看：
   * LLBot 被作废会话后不会断开 WebSocket，只让心跳持续失败。
   * 于是 connected 仍为 true、面板显示「运行中」，而实际上收不到任何消息。
   * 这种「假在线」比明显掉线更危险，所以单独透出一项。
   */
  sessionDead: boolean;
  /** 二维码是否可读。 */
  hasQr: boolean;
  /** 二维码是否新鲜（新鲜才值得展示）。 */
  qrFresh: boolean;
  /** 二维码图片字节。仅在需要展示时返回。 */
  qr: Buffer | null;
  /** 看门狗最近一次自动恢复尝试的时间戳（毫秒）。没尝试过为 null。 */
  recoveryAttemptedAt: number | null;
  /** 最近一次自动恢复的结果描述。 */
  recoveryResult: string | null;
}

async function fetchConnected(): Promise<{ reachable: boolean; connected: boolean }> {
  try {
    const res = await fetch(`${BOT_HEALTH_URL}/status`, {
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return { reachable: true, connected: false };
    const data = (await res.json()) as { connected?: boolean };
    return { reachable: true, connected: data.connected === true };
  } catch {
    // 连不上 bot 本身
    return { reachable: false, connected: false };
  }
}

async function readQr(service: string | null): Promise<{
  hasQr: boolean;
  qrFresh: boolean;
  qr: Buffer | null;
}> {
  const path = service ? QR_PATHS[service] : undefined;
  if (!path) return { hasQr: false, qrFresh: false, qr: null };

  try {
    const info = await stat(path);
    const fresh = Date.now() - info.mtimeMs < QR_FRESH_MS;
    // 只有新鲜且可能要用时才读内容，避免做无谓的 IO
    const qr = fresh ? await readFile(path) : null;
    return { hasQr: true, qrFresh: fresh, qr };
  } catch {
    return { hasQr: false, qrFresh: false, qr: null };
  }
}

/**
 * 读取看门狗状态。
 *
 * 读不到（未安装看门狗、或文件尚未生成）时返回空值 ——
 * 面板会因此不显示自动恢复的提示，而不是报错。
 */
async function readWatchdog(): Promise<{
  attemptedAt: number | null;
  result: string | null;
  activeService: string | null;
  sessionDead: boolean;
}> {
  const empty = {
    attemptedAt: null,
    result: null,
    activeService: null,
    sessionDead: false,
  };
  try {
    const raw = await readFile(WATCHDOG_STATE_PATH, "utf8");
    const data = JSON.parse(raw) as {
      lastAttemptAt?: number;
      lastAttemptResult?: string;
      activeService?: string;
      sessionDead?: boolean;
    };
    return {
      // 脚本写的是秒，这里转成毫秒以便直接给 Date 用
      attemptedAt: typeof data.lastAttemptAt === "number" ? data.lastAttemptAt * 1000 : null,
      result: typeof data.lastAttemptResult === "string" ? data.lastAttemptResult : null,
      activeService: typeof data.activeService === "string" ? data.activeService : null,
      // 缺省为 false：读不到状态文件时不要凭空报「登录态失效」
      sessionDead: data.sessionDead === true,
    };
  } catch {
    return empty;
  }
}

export async function getBotStatus(): Promise<BotStatus> {
  // 先读看门狗状态：它决定二维码该去哪个路径找
  const watchdog = await readWatchdog();

  const [health, qr] = await Promise.all([
    fetchConnected(),
    readQr(watchdog.activeService),
  ]);

  return {
    connected: health.connected,
    reachable: health.reachable,
    activeService: watchdog.activeService,
    sessionDead: watchdog.sessionDead,
    hasQr: qr.hasQr,
    qrFresh: qr.qrFresh,
    // 真正在线时不需要二维码 —— 不把它读进内存、也不返回给页面。
    // 但「假在线」（sessionDead）时要给：那种状态下码正是恢复手段。
    qr: health.connected && !watchdog.sessionDead ? null : qr.qr,
    recoveryAttemptedAt: watchdog.attemptedAt,
    recoveryResult: watchdog.result,
  };
}
