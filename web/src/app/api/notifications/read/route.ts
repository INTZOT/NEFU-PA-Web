import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { markRead } from "@/modules/notification/service";

/**
 * 标记一条通知已读，然后跳到它的目标页。
 *
 * 为什么做成一个 GET 跳转而不是客户端 fetch + router.push：
 * 列表是服务端渲染的，用普通链接就能完成「标记已读 + 跳转」，
 * 不需要为这一件事引入客户端组件。
 *
 * 幂等：markRead 只更新 read_at IS NULL 的行，重复点击无副作用。
 *
 * ⚠️ `to` 必须校验为站内路径 —— 否则就成了开放重定向漏洞
 *    （攻击者可构造 /api/notifications/read?to=https://evil.com 来钓鱼）。
 */
/**
 * 拼出**公网可见的**绝对地址。
 *
 * ⚠️ 不能用 `new URL(path, req.url)`：容器内 `req.url` 是应用监听的地址
 * （实测为 http://0.0.0.0:3000），拿它做跳转会把握手后的用户送到
 * 一个打不开的地址上。Caddy 会带上 X-Forwarded-* 头，用它们还原真实地址。
 */
function absoluteUrl(req: NextRequest, path: string): string {
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return proto + "://" + host + path;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(absoluteUrl(req, "/login"));
  }

  const id = req.nextUrl.searchParams.get("id");
  const rawTo = req.nextUrl.searchParams.get("to") ?? "/notifications";

  if (id) {
    try {
      await markRead(user.id, id);
    } catch (err) {
      // id 非法（非 uuid）时不要 500 —— 标记失败不该挡住跳转
      console.error("[notification] 标记已读失败", err);
    }
  }

  // 只允许站内路径：以单个 / 开头，且不是 //（协议相对 URL）。
  //
  // 同时拒绝反斜杠：部分浏览器会把 `\` 当成 `/`，于是
  // `\/\/evil.com` 这类构造能绕过基于字符串的检查（历史漏洞模式）。
  const isSafe = /^\/(?!\/)/.test(rawTo) && !rawTo.includes("\\");
  const safe = isSafe ? rawTo : "/notifications";
  return NextResponse.redirect(absoluteUrl(req, safe));
}
