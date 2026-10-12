import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const form = await request.formData();
  const value = Number(form.get("selfRating"));

  if (!Number.isInteger(value) || value < 0 || value > 1000) {
    return NextResponse.redirect(new URL("/me?error=自评分需为 0–1000 的整数", request.url), 303);
  }

  await query("UPDATE users SET self_rating = $2 WHERE id = $1", [user.id, value]);
  return NextResponse.redirect(new URL("/me?saved=1", request.url), 303);
}
