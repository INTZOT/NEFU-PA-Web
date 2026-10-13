import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isSuperAdmin } from "@/lib/roles";
import { getBotStatus } from "@/modules/bot/status";

/**
 * NapCat 登录二维码 —— **仅超级管理员**。
 *
 * 权限说明：二维码等同于该 QQ 号的登录凭据。但超管本来就能重置任意成员密码、
 * 设置管理员、删任何内容 —— 在这个权限模型下，能看到二维码**并不越权**，
 * 而且「恢复通道」本就该放在最高权限处。
 *
 * 相比曾经用过的临时公开路由 /qr（任何人访问都能抢登），这里必须登录且必须是超管。
 *
 * 缓存：必须 no-store。浏览器缓存旧二维码会让人扫到一个已失效的码，
 * 而二维码本身的内容是变的（协议端约每 2 分钟换一次）。
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!isSuperAdmin(user)) return new NextResponse("Forbidden", { status: 403 });

  const status = await getBotStatus();

  // 「真正在线」时没有二维码可言（协议端不会生成）。
  //
  // ⚠️ 判断条件必须与 status.ts 里的一致 —— 不能只看 connected：
  // LLBot 被作废会话后会保持 WebSocket 连接（假在线），此时 connected 为 true，
  // 但二维码恰恰是恢复手段，必须给出。这里曾漏掉 sessionDead，
  // 导致假在线时既显示「登录已失效」又拿不到码。
  const trulyOnline = status.connected && !status.sessionDead;
  if (trulyOnline || !status.qr) {
    return new NextResponse("No QR available", {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }

  return new NextResponse(new Uint8Array(status.qr), {
    headers: {
      "content-type": "image/png",
      "content-length": String(status.qr.length),
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
}
