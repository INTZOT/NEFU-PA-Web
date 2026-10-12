import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { redirectTo } from "@/lib/redirect";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return redirectTo(request, "/login");
  }

  const form = await request.formData();
  const value = Number(form.get("selfRating"));

  if (!Number.isInteger(value) || value < 0 || value > 1000) {
    return redirectTo(request, "/me?error=自评分需为 0–1000 的整数");
  }

  await query("UPDATE users SET self_rating = $2 WHERE id = $1", [user.id, value]);
  return redirectTo(request, "/me?saved=1");
}
