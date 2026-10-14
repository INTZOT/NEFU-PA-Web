import Link from "next/link";
import { Notice } from "@/components/Notice";

export const metadata = { title: "注册" };

/**
 * 注册页（D-45）。
 *
 * 与旧流程的区别：**不再需要邀请码**。
 * 用户填 QQ 号，机器人在社团群里 @ 他本人确认 —— 这样全程不产生
 * 「非好友私聊」（那是腾讯风控的高危模式）。
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    name?: string;
    studentId?: string;
    qq?: string;
  }>;
}) {
  const { error, name, studentId, qq } = await searchParams;

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="text-xl font-bold">注册</h1>
        <p className="mt-1 text-sm text-ink-muted">
          填好后机器人会在<strong>社团群里 @ 你</strong>，
          你在群里回复「确认注册」即可完成 —— 无需私聊机器人。
        </p>
      </div>

      <Notice error={error} />

      <form action="/api/auth/register" method="post" className="space-y-4">
        <Field label="姓名" name="name" required defaultValue={name} />
        <Field
          label="学号"
          name="studentId"
          placeholder="10 位数字，例如 2025213063"
          required
          defaultValue={studentId}
        />
        <Field
          label="QQ 号"
          name="qq"
          placeholder="机器人会在群里 @ 这个号"
          required
          defaultValue={qq}
        />
        <Field label="密码" name="password" type="password" hint="至少 6 位" required />

        <button type="submit" className="w-full rounded bg-brand px-4 py-2 text-white">
          提交，去群里确认
        </button>
      </form>

      <p className="text-sm text-ink-muted">
        已有账号？
        <Link href="/login" className="text-brand hover:underline">去登录</Link>
        {" · "}
        <Link href="/forgot" className="text-brand hover:underline">忘记密码</Link>
      </p>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  hint,
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded border border-line-strong px-3 py-2 outline-none focus:border-brand"
      />
      {hint ? <span className="mt-1 block text-xs text-ink-muted">{hint}</span> : null}
    </label>
  );
}
