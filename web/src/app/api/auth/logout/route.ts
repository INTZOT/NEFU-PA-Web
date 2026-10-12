import { destroySession } from "@/lib/session";
import { redirectTo } from "@/lib/redirect";

export async function POST(request: Request) {
  await destroySession();
  return redirectTo(request, "/");
}
