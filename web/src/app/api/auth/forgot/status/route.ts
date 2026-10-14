import { NextResponse } from "next/server";
import { resetStatus } from "@/modules/account/reset-flow";

/** 轮询：该 QQ 号的重置申请当前处于哪一步（D-45 方案 B）。 */
export async function GET(request: Request) {
  const qq = new URL(request.url).searchParams.get("qq") ?? "";
  const status = await resetStatus(qq);
  return NextResponse.json(
    { status },
    { headers: { "cache-control": "no-store" } },
  );
}
