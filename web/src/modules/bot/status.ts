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

import { readFile, readdir, stat } from "node:fs/promises";

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

/**
 * LLBot 登录成功后落盘的会话目录（只读挂载）。
 *
 * 用途：**判断「二维码新鲜」到底是「在等登录」还是「刚登录完」**。
 *
 * 踩过的坑：只按「二维码文件新鲜」判断，会把刚扫码成功的那一刻误判为「仍在等登录」——
 * 因为那个二维码文件在登录后仍会「新鲜」几分钟。结果刚登录成功，面板却报「登录已失效」。
 * 反过来更糟：真正在等登录时若判断失灵，就会显示「运行中」（假在线）。
 *
 * 会话文件的 **mtime ≈ 登录成功时刻**，所以：二维码文件比会话文件新 → 真的在等登录。
 */
const LLBOT_DATA_DIR = process.env.LLBOT_DATA_DIR ?? "/app/llbot-cache";

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
 * 判断二维码是否**真的**在等登录。
 *
 * 判据：二维码文件比「最近一次登录成功的会话文件」更新。
 *
 * 为什么不能只看二维码是否新鲜：扫码成功的那一刻二维码文件仍然新鲜，
 * 于是会把「刚登录成功」误报成「登录已失效」。
 * 会话文件的 mtime 就是登录成功时刻，比它新才说明之后又开始拉新码了。
 */
async function isWaitingForLogin(qrPath: string, qrFresh: boolean): Promise<boolean> {
  if (!qrFresh) return false;

  try {
    const dir = await readdir(LLBOT_DATA_DIR);
    const qrStat = await stat(qrPath);

    // 找最近写入的会话文件（形如 qq-session-<uin>.json）
    let newestSession = 0;
    for (const name of dir) {
      if (!name.startsWith("qq-session-")) continue;
      try {
        const s = await stat(`${LLBOT_DATA_DIR}/${name}`);
        if (s.mtimeMs > newestSession) newestSession = s.mtimeMs;
      } catch {
        // 单个文件读失败不影响整体判断
      }
    }

    // 没有会话文件 = 从未登录成功 → 确实在等登录
    if (newestSession === 0) return true;

    // 二维码比会话新 → 登录后又开始拉码（会话失效，需要重新登录）
    return qrStat.mtimeMs > newestSession;
  } catch {
    // 读不到会话目录（未挂载等）时，退回原判据 —— 宁可提示登录失效，
    // 也不要因为读不到目录就谎报「运行中」（假在线更危险）。
    return true;
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

  // ⚠️ 「在等扫码」是最可靠的掉线信号，**不要只依赖看门狗**。
  //
  // 踩过的坑：看门狗靠日志特征判断登录态是否失效，而那些特征会随协议端版本/报错种类变化
  // （曾按 `Heartbeat.Alive] Failed` 判断，后来 LLBot 实际报的是「签名服务网络超时 + 二维码过期」，
  // 特征对不上 → sessionDead 一直是 false → 机器人在等扫码，面板却显示「运行中」）。
  //
  // 而「协议端刚写了新二维码」这件事本身就无可辩驳：**它在等人登录**。
  // 这个信号由文件时间直接得出，不依赖任何日志文本。
  //
  // 但**必须排除「刚登录成功」**——那时二维码文件也还新鲜，
  // 否则会出现「扫码成功了，面板却报登录已失效」。判据见 isWaitingForLogin。
  const qrPath = watchdog.activeService ? QR_PATHS[watchdog.activeService] : undefined;
  const waitingForLogin = qrPath
    ? await isWaitingForLogin(qrPath, qr.qrFresh)
    : false;

  // ⚠️ 先算出「最终判定」，后面的字段**一律引用它**，不要各自去读 watchdog。
  //
  // 这里踩过坑：sessionDead 用了一个口径、qr 用了另一个口径，
  // 结果面板显示「登录已失效」（正确）却拿不到二维码（因为 qr 那边仍按
  // 「看门狗说没死」把码丢掉了）。两个字段口径不一致就会出现这种自相矛盾的状态。
  const sessionDead = watchdog.sessionDead || waitingForLogin;
  // 「真正在线」= 连接在 **且** 登录态有效。只看 connected 会掉进假在线的坑。
  const trulyOnline = health.connected && !sessionDead;

  return {
    connected: health.connected,
    reachable: health.reachable,
    activeService: watchdog.activeService,
    sessionDead,
    hasQr: qr.hasQr,
    qrFresh: qr.qrFresh,
    // 真正在线时不需要二维码 —— 不把它读进内存、也不返回给页面。
    // 但「假在线」或「等登录」时要给：那种状态下码正是恢复手段。
    qr: trulyOnline ? null : qr.qr,
    recoveryAttemptedAt: watchdog.attemptedAt,
    recoveryResult: watchdog.result,
  };
}
