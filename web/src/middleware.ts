/**
 * 内容安全策略（CSP）—— 用 nonce 而不是 unsafe-inline。
 *
 * ⚠️ 这里有一段教训值得写下来：
 *   最初我把 CSP 写在 Caddy 里，用 script-src 'self'。这**打断了整站交互** ——
 *   Next.js 会内联注入 3 个关键脚本（Turbopack 的 chunk 清单、RSC payload），
 *   它们是 React 水合的前提，被 CSP 拦掉后页面就成了静态 HTML。
 *   当时我用无头浏览器截图发现「轮播不动」，却误判为工具缺陷 ——
 *   其实是真实回归。后来才发现内联脚本的存在。
 *
 * 正确做法：由**中间件生成 nonce**，写进两个地方 ——
 *   1. **请求头**：Next.js 会读取它（getScriptNonceFromHeader），
 *      自动给它的内联脚本加上 nonce 属性；
 *   2. **响应头**：浏览器据此校验。
 * 这样 CSP 与脚本标签必然一致（都源自同一次 nonce 生成）。
 *
 * 为什么不加 'unsafe-inline'：那等于放弃 CSP 对注入脚本的防护，
 * 而 nonce 方案在 Next.js 里是官方支持的路径，成本很低。
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // nonce 让 Next.js 的内联脚本可执行；'strict-dynamic' 让它们动态加载的 chunk 也被信任
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // 样式仍需 unsafe-inline：Next.js 会内联注入样式，且样式注入的风险远低于脚本
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");
}

function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const CSP_HEADER = "content-security-policy";

import { NextResponse, type NextRequest } from "next/server";

/**
 * 认证接口的尝试次数限流（安全 review 的整改项之一）。
 *
 * 为什么需要：
 *   实测登录接口原本无限流 —— 15 次错误尝试 3 秒完成。单次登录虽有约 200ms 的 scrypt 成本
 *   （并发下约 12 次/秒），但对弱密码来说这个速率已经足够危险。
 *   注册接口的限流则用来挡「批量试探邀请码」。
 *
 * 设计取舍：
 *   - **内存计数，不入库**：本项目单实例部署（一个 web 容器），内存足够；
 *     入库会让每次登录多一次写操作，还要额外做清理。
 *   - **按 IP 而不是按账号**：按账号会让攻击者故意输错来锁死别人的账号。
 *   - **成功即清零**：见 `/api/auth/login` —— 它会在登录成功后调用本模块导出的
 *     `clearRateLimit`。因此正常人偶尔输错几次不会被误伤。
 *   - **进程重启后计数清零**：可接受，攻击者无法控制我们何时重启。
 *   - **取不到 IP 时不限流（fail-open）**：宁可漏挡，也不要把所有人锁在门外。
 *
 * 阈值：登录 10 次/分钟、30 次/小时；注册 20 次/分钟、60 次/小时。
 * 正常人在一次会话里不会输错 10 次密码；而攻击速率被压到 1/6 以下。
 *
 * 已知局限：分布式攻击（多 IP）可绕过。本项目是校园社团站，不具针对性攻击价值，
 * 因此不引入需要外部存储的分布式限流方案。
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

const LIMITS = {
  login: { perMinute: 10, perHour: 30 },
  register: { perMinute: 20, perHour: 60 },
} as const;

type Kind = keyof typeof LIMITS;

interface Bucket {
  minute: number[];
  hour: number[];
}

/** 模块级 Map：Next.js 在单个实例内复用模块作用域，即天然的进程内计数器。 */
const buckets = new Map<string, Bucket>();

function read(key: string, now: number): Bucket {
  const existing = buckets.get(key) ?? { minute: [], hour: [] };
  // 顺手清掉过期时间戳，Map 不会无限增长
  return {
    minute: existing.minute.filter((t) => now - t < MINUTE_MS),
    hour: existing.hour.filter((t) => now - t < HOUR_MS),
  };
}

/**
 * 客户端 IP。Caddy 会设置 X-Forwarded-For，取其第一个值；
 * 取不到则退回 X-Real-IP；都没有返回 null（此时不限流）。
 */
function clientIp(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

function keyOf(kind: Kind, ip: string): string {
  return `${kind}:${ip}`;
}

/**
 * 供路由处理清空计数的请求头名。
 *
 * 为什么用请求头传递：中间件与路由处理是两个独立模块，
 * 而路由处理拿到的只是普通 Request（无法调用中间件的函数）。
 * 于是中间件把「本次请求的限流键」写进请求头，路由在处理成功后删掉它。
 * 该头由中间件覆盖写入，客户端伪造无效。
 */
export const RATE_LIMIT_HEADER = "x-ratelimit-key";

/** 供路由处理调用的清零逻辑（模块作用域共享同一个 Map）。 */
export function clearKey(key: string): void {
  buckets.delete(key);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 每次请求生成一个新 nonce：CSP 与脚本标签都源自它，因此两者必然一致
  const nonce = makeNonce();
  const csp = buildCsp(nonce);

  // 请求头：Next.js 会读取它，给自身的 3 个内联脚本（Turbopack 清单、RSC payload）
  // 加上 nonce 属性。缺了这一步，水合会被 CSP 拦断。
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CSP_HEADER, csp);

  /** 统一挂上响应头（页面、API、限流响应都要带）。 */
  const withSecurity = (response: NextResponse): NextResponse => {
    response.headers.set(CSP_HEADER, csp);
    return response;
  };

  // ---- 认证接口限流 ----
  const kind: Kind | null =
    pathname === "/api/auth/login"
      ? "login"
      : pathname === "/api/auth/register"
        ? "register"
        : null;

  // 不是认证接口：只需注入 CSP，直接放行
  if (!kind || request.method !== "POST") {
    return withSecurity(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  const ip = clientIp(request);
  if (!ip) {
    return withSecurity(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  const now = Date.now();
  const key = keyOf(kind, ip);
  const bucket = read(key, now);
  const limit = LIMITS[kind];

  if (bucket.minute.length >= limit.perMinute || bucket.hour.length >= limit.perHour) {
    return withSecurity(
      NextResponse.json(
        { error: "尝试过于频繁，请稍后再试" },
        { status: 429, headers: { "retry-after": "60" } },
      ),
    );
  }

  // 先记一次：无论后续成功失败都算一次尝试。
  // 成功登录会被 clearKey 抹掉，所以只有「反复失败」才会累积到上限。
  bucket.minute.push(now);
  bucket.hour.push(now);
  buckets.set(key, bucket);

  // 把限流键传给路由处理：登录成功后由它清零（成功不该计入失败次数）
  requestHeaders.set(RATE_LIMIT_HEADER, key);
  return withSecurity(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  // 覆盖全部路由：CSP 要作用于所有页面与接口
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo|icon|apple-icon).*)"],
};
