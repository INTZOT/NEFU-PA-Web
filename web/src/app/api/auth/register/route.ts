import { NextResponse } from "next/server";
import { register } from "@/modules/account/service";
import { createSession } from "@/lib/session";

export async function POST(request: Request) {
  const form = await request.formData();
  const result = await register({
    name: String(form.get("name") ?? ""),
    studentId: String(form.get("studentId") ?? ""),
    password: String(form.get("password") ?? ""),
    inviteCode: String(form.get("inviteCode") ?? ""),
  });

  if (!result.ok) {
    return NextResponse.redirect(new URL(`/register?error=${encodeURIComponent(result.error)}`, request.url), 303);
  }

  await createSession(result.userId);
  return NextResponse.redirect(new URL("/me?welcome=1", request.url), 303);
}
