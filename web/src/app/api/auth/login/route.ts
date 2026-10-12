import { login } from "@/modules/account/service";
import { createSession } from "@/lib/session";
import { redirectTo } from "@/lib/redirect";

export async function POST(request: Request) {
  const form = await request.formData();
  const result = await login(
    String(form.get("ident") ?? ""),
    String(form.get("password") ?? ""),
  );

  if (!result.ok) {
    return redirectTo(request, `/login?error=${encodeURIComponent(result.error)}`);
  }

  await createSession(result.userId);
  return redirectTo(request, "/me");
}
