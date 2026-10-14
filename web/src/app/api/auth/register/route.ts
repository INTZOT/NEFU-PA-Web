import { redirectTo } from "@/lib/redirect";
import { startRegistration, echoBack } from "@/modules/account/register-flow";

/**
 * 注册第一步（D-45）：校验表单 → 写入待确认 → 请机器人在群里 @ 本人。
 *
 * 成功后跳到「等待确认」页轮询；**此时还没有建号**。
 * 建号发生在机器人群内确认的那一刻（bot 侧完成）。
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const input = {
    name: String(form.get("name") ?? ""),
    studentId: String(form.get("studentId") ?? ""),
    password: String(form.get("password") ?? ""),
    qq: String(form.get("qq") ?? ""),
  };

  const result = await startRegistration(input);

  if (!result.ok) {
    // 回填已填内容，避免用户重打一遍（密码除外 —— 不回填密码）
    const back = echoBack({
      name: input.name,
      studentId: input.studentId,
      qq: input.qq,
    });
    const qs = `error=${encodeURIComponent(result.error)}&${back}`;
    return redirectTo(request, `/register?${qs}`);
  }

  return redirectTo(request, `/register/waiting?qq=${encodeURIComponent(result.qq)}`);
}
