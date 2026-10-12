import { NextResponse } from "next/server";
import { login } from "@/modules/account/service";
import { createSession } from "@/lib/session";

export async function POST(request: Request) {
  const form = await request.formData();
  const result = await login(
    String(form.get("ident") ?? ""),
    String(form.get("password") ?? ""),
  );

  if (!result.ok) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(result.error)}`, request.url), 303);
  }

  await createSession(result.userId);
  return NextResponse.redirect(new URL("/me", request.url), 303);
}
