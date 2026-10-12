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
 */
function publicOrigin(request: Request): string {
  const headers = request.headers;

  const forwardedHost = headers.get("x-forwarded-host");
  const forwardedProto = headers.get("x-forwarded-proto");
  if (forwardedHost) {
    const proto = forwardedProto?.split(",")[0]?.trim() || "https";
    return `${proto}://${forwardedHost.split(",")[0].trim()}`;
  }

  const host = headers.get("host");
  if (host) {
    const proto = forwardedProto?.split(",")[0]?.trim() || "https";
    return `${proto}://${host}`;
  }

  return new URL(request.url).origin;
}

/** 303 重定向到应用内的某个路径。 */
export function redirectTo(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, publicOrigin(request)), 303);
}
