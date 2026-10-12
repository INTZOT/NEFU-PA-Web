import { getCurrentUser } from "@/lib/session";
import { redirectTo } from "@/lib/redirect";
import { queryOne } from "@/lib/db";
import { invitePartner } from "@/modules/event/pairing";
import { getById } from "@/modules/event/service";

/**
 * 登记搭档。
 *
 * 输入是搭档的标识（QQ 号或学号）—— 让用户填 QQ 号比填姓名可靠，
 * 因为姓名可能重名，而 QQ 号是 [D-13](decisions.md) 的账号锚点。
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");

  const { id } = await params;
  const back = `/events/${id}`;

  const event = await getById(id);
  if (!event) return redirectTo(request, `${back}?error=${encodeURIComponent("赛事不存在")}`);
  if (event.format !== "doubles") {
    return redirectTo(request, `${back}?error=${encodeURIComponent("只有双打赛事需要登记搭档")}`);
  }

  const form = await request.formData();
  const ident = String(form.get("partnerIdent") ?? "").trim();
  if (!ident) {
    return redirectTo(request, `${back}?error=${encodeURIComponent("请填写搭档的 QQ 号或学号")}`);
  }

  const partner = await queryOne<{ id: string; name: string }>(
    "SELECT id, name FROM users WHERE qq_number = $1 OR student_id = $1 LIMIT 1",
    [ident],
  );
  if (!partner) {
    return redirectTo(request, `${back}?error=${encodeURIComponent("找不到这个成员")}`);
  }

  const result = await invitePartner(id, user.id, partner.id);
  if (!result.ok) {
    return redirectTo(request, `${back}?error=${encodeURIComponent(result.error)}`);
  }

  return redirectTo(
    request,
    `${back}?ok=${encodeURIComponent(`已向 ${partner.name} 发出搭档邀请，等待对方确认`)}`,
  );
}
