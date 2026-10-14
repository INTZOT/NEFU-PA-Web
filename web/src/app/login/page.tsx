import Link from "next/link";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="text-xl font-bold">登录</h1>
        <p className="mt-1 text-sm text-ink-muted">可用学号或 QQ 号登录。</p>
      </div>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <form action="/api/auth/login" method="post" className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">学号 或 QQ 号</span>
          <input
            name="ident"
            required
            className="w-full rounded border border-line-strong px-3 py-2 outline-none focus:border-brand"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">密码</span>
          <input
            name="password"
            type="password"
            required
            className="w-full rounded border border-line-strong px-3 py-2 outline-none focus:border-brand"
          />
        </label>

        <button type="submit" className="w-full rounded bg-brand px-4 py-2 text-white">
          登录
        </button>
      </form>

      {/*
       * ⚠️ 这里的引导必须跟随重置流程走。
       * 旧版写的是「私聊机器人发送重置密码」—— 那套已废弃（D-45）：
       * 私聊机器人**不再有任何回复**，照做的用户会以为机器人坏了。
       */}
      <div className="space-y-1 text-sm text-ink-muted">
        <p>
          忘记密码？
          <Link href="/forgot" className="text-brand hover:underline">
            点这里找回
          </Link>
          —— 机器人在群里 @ 你确认后即可设置新密码。
        </p>
        <p>
          还没有账号？
          <Link href="/register" className="text-brand hover:underline">去注册</Link>
        </p>
      </div>
    </div>
  );
}
