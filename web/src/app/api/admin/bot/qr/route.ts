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
 * 而二维码本身的内容是变的（NapCat 约每 2 分钟换一次）。
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!isSuperAdmin(user)) return new NextResponse("Forbidden", { status: 403 });

  const status = await getBotStatus();

  // 已连接时没有二维码可言（NapCat 不会生成）
  if (status.connected || !status.qr) {
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
