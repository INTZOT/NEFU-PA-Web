import { register } from "@/modules/account/service";
import { createSession } from "@/lib/session";
import { redirectTo } from "@/lib/redirect";

export async function POST(request: Request) {
  const form = await request.formData();
  const result = await register({
    name: String(form.get("name") ?? ""),
    studentId: String(form.get("studentId") ?? ""),
    password: String(form.get("password") ?? ""),
    inviteCode: String(form.get("inviteCode") ?? ""),
  });

  if (!result.ok) {
    return redirectTo(request, `/register?error=${encodeURIComponent(result.error)}`);
  }

  await createSession(result.userId);
  return redirectTo(request, "/me?welcome=1");
}
