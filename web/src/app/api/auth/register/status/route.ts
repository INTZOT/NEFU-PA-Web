import { NextResponse } from "next/server";
import { getCurrentUser, createSession } from "@/lib/session";
import { queryOne } from "@/lib/db";
import { registrationStatus } from "@/modules/account/confirm";

/**
 * 轮询：注册是否已由群内确认完成（D-45）。
 *
 * 完成时**顺带建立登录会话** —— 用户的体验就是「确认完自动进站」。
 * 若已登录（例如用户在另一标签页登过），不重复建会话。
 */
export async function GET(request: Request) {
  const qq = new URL(request.url).searchParams.get("qq") ?? "";
  if (!/^[0-9]{5,12}$/.test(qq)) {
    return NextResponse.json({ status: "missing" }, { status: 400 });
  }

  const status = await registrationStatus(qq);

  if (status === "done") {
    const current = await getCurrentUser();
    if (!current) {
      const row = await queryOne<{ id: string }>(
        "SELECT id FROM users WHERE qq_number = $1 LIMIT 1",
        [qq],
      );
      if (row) await createSession(row.id);
    }
  }

  return NextResponse.json({ status }, { headers: { "cache-control": "no-store" } });
}
