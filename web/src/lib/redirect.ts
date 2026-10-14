import { NextResponse } from "next/server";

/**
 * 构造重定向响应。
 *
 * 为什么不直接用 `new URL(path, request.url)`：
 *   应用跑在 Caddy 反向代理之后，此时 `request.url` 解析出来的是
 *   **容器内部地址**（http://0.0.0.0:3000），于是浏览器会被跳到
 *   `https://0.0.0.0:3000/...` 这种打不开的地址。
 *
 *   因此对外地址必须从反向代理传来的头里取：
 *     X-Forwarded-Proto / X-Forwarded-Host（Caddy 默认会带上）
 *   取不到时退回 Host 头；再取不到才用 request.url。
 *
 * ⚠️ 但**不能无条件信任这些头**。
 *   当前部署下 Caddy 会覆盖它们（实测伪造无效），所以暂时不可利用；
 *   但这属于「配置正确才安全」—— 一旦将来在 Caddy 前面加 CDN，
 *   或有人配了 trusted_proxies，`X-Forwarded-Host: evil.com` 就会让
 *   Location 指向外站，成为高质量的钓鱼跳板。
 *
 *   因此这里加一层**白名单兜底**：只接受 SITE_URL 里的主机名，
 *   否则回退到它。这样即使代理配置变了，也跳不出去。
 *   同时顺带修掉「畸形 host 让 new URL 抛异常 → 500」的问题。
 */

/** 站点对外地址（来自环境变量）。解析失败时为 null。 */
function siteOrigin(): { host: string; proto: string } | null {
  const raw = process.env.SITE_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return { host: u.host, proto: u.protocol.replace(":", "") };
  } catch {
    return null;
  }
}

function publicOrigin(request: Request): string {
  const headers = request.headers;
  const site = siteOrigin();

  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const candidate = forwardedHost || headers.get("host")?.trim() || null;

  // 白名单：只信任与 SITE_URL 一致的主机名。
  // 没配 SITE_URL 时（本地开发）退回原来的行为，不把功能弄坏。
  if (site && candidate && candidate !== site.host) {
    return `${site.proto}://${site.host}`;
  }

  if (candidate) {
    const proto = forwardedProto || site?.proto || "https";
    // 防御畸形 host（含斜杠、方括号、空格等）导致 new URL 抛异常 → 500
    if (/^[A-Za-z0-9.\-]+(:\d+)?$/.test(candidate)) {
      return `${proto}://${candidate}`;
    }
  }

  if (site) return `${site.proto}://${site.host}`;
  return new URL(request.url).origin;
}

/** 303 重定向到应用内的某个路径。 */
export function redirectTo(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, publicOrigin(request)), 303);
}
