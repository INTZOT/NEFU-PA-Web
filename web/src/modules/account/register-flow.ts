/**
 * 注册流程（D-45）：表单 → 群内 @ 确认 → 建号。
 *
 * 与旧的「邀请码」路径的区别：
 *   旧：私聊机器人拿码（**非好友私聊**，腾讯风控高危）→ 填码注册
 *   新：网站在线填表 → 机器人群里 @ 本人 → 本人回复确认 → 建号
 *
 * QQ 号现在是**用户自己填的**，因此不再由邀请码带入。
 * 防冒用的机制放在群里：机器人 @ 的是那个号本人，只有他能用**自己的号**回复确认。
 */

import { hashPassword } from "@/lib/password";
import { queryOne } from "@/lib/db";
import { createPendingRegistration } from "@/modules/account/confirm";
import { requestGroupMention } from "@/modules/bot/notify";

const STUDENT_ID_RE = /^[0-9]{10}$/;
/** QQ 号长度：5~12 位数字（QQ 号历史上从 5 位到 11 位都有，留足余量）。 */
const QQ_RE = /^[0-9]{5,12}$/;
const MIN_PASSWORD = 6;

export interface RegisterStartInput {
  name: string;
  studentId: string;
  password: string;
  qq: string;
}

export type RegisterStartResult =
  | { ok: true; qq: string }
  | { ok: false; error: string };

/**
 * 第一步：校验表单、写入待确认，并请机器人在群里 @ 本人。
 *
 * 成功后用户进入「等待群内确认」状态，由前端轮询。
 */
export async function startRegistration(
  input: RegisterStartInput,
): Promise<RegisterStartResult> {
  const name = input.name.trim();
  const studentId = input.studentId.trim();
  const qq = input.qq.replace(/\D/g, "");

  // ---- 校验 ----
  if (!name) return { ok: false, error: "请填写姓名" };
  if (!STUDENT_ID_RE.test(studentId)) return { ok: false, error: "学号应为 10 位数字" };
  if (input.password.length < MIN_PASSWORD) {
    return { ok: false, error: `密码至少 ${MIN_PASSWORD} 位` };
  }
  if (!QQ_RE.test(qq)) return { ok: false, error: "请填写正确的 QQ 号（5~12 位数字）" };

  // 已注册的号直接拒绝 —— 否则群里会白 @ 一次
  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM users WHERE qq_number = $1 LIMIT 1",
    [qq],
  );
  if (existing) return { ok: false, error: "该 QQ 号已注册，请直接登录或找回密码" };

  // 密码散列全项目只有一份实现（lib/password），此处复用
  const passwordHash = await hashPassword(input.password);

  // 写入待确认。表上有唯一约束：同一 QQ 号重复发起会覆盖旧记录，不会刷屏。
  await createPendingRegistration({ qq, name, studentId, passwordHash });

  // 请机器人在群里 @ 本人
  const mention = await requestGroupMention(qq, name, "register");
  if (!mention.ok) {
    return { ok: false, error: mention.error ?? "无法通知机器人" };
  }

  return { ok: true, qq };
}

/** 表单回填用：把用户输入带回页面，避免出错后要重填。 */
export function echoBack(input: Partial<RegisterStartInput>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string" && v) params.set(k, v);
  }
  return params.toString();
}
