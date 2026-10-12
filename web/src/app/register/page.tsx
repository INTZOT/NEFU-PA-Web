import Link from "next/link";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="text-xl font-bold">注册</h1>
        <p className="mt-1 text-sm text-neutral-600">
          邀请码来自 QQ 群内的社团机器人。QQ 号由邀请码自动带入，无需填写。
        </p>
      </div>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <form action="/api/auth/register" method="post" className="space-y-4">
        <Field label="姓名" name="name" required />
        <Field label="学号" name="studentId" placeholder="10 位数字，例如 2025213063" required />
        <Field label="密码" name="password" type="password" hint="至少 6 位" required />
        <Field label="邀请码" name="inviteCode" placeholder="群内机器人发给你的一串字符" required />

        <button type="submit" className="w-full rounded bg-neutral-900 px-4 py-2 text-white">
          完成注册
        </button>
      </form>

      <p className="text-sm text-neutral-600">
        已有账号？
        <Link href="/login" className="text-blue-600 hover:underline">去登录</Link>
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
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className="w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
      />
      {hint ? <span className="mt-1 block text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}
