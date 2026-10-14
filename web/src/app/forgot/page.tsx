import Link from "next/link";
import { Notice } from "@/components/Notice";

export const metadata = { title: "找回密码" };

/**
 * 找回密码（D-45）。
 *
 * 流程：填 QQ 号 → 机器人在群里 @ 本人 → 本人回复「确认重置」
 *       → **回到本流程的浏览器里就地设置新密码**。
 *
 * 为什么不发链接（D-45 方案 B）：
 *   发链接的缺陷是「谁发起」与「谁确认」可能是两个人 ——
 *   攻击者可发起重置，再诱导被 @ 的人「看到提醒就顺手回复确认」。
 *   改成「同浏览器完成」后，改密额外要求带着发起时的 httpOnly cookie，
 *   攻击者拿不到受害者浏览器里的那个 cookie，因此改不了密码。
 *   顺带彻底不需要私聊 —— 机器人不必主动联系任何人。
 */
export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="text-xl font-bold">找回密码</h1>
        <p className="mt-1 text-sm text-ink-muted">
          填写你的 QQ 号。机器人会在<strong>社团群里 @ 你</strong>，
          你在群里回复「确认重置」后，<strong>回到本页</strong>即可设置新密码。
        </p>
      </div>

      <Notice error={error} />

      <form action="/api/auth/forgot" method="post" className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">QQ 号</span>
          <input
            name="qq"
            required
            inputMode="numeric"
            placeholder="注册时用的那个 QQ 号"
            className="w-full rounded border border-line-strong px-3 py-2 outline-none focus:border-brand"
          />
        </label>

        <button type="submit" className="w-full rounded bg-brand px-4 py-2 text-white">
          提交，去群里确认
        </button>
      </form>

      <div className="space-y-1 text-xs text-ink-subtle">
        <p>· 改密链接只能用一次，有效期 10 分钟。</p>
        <p>
          · <strong>如果群里有人 @ 你而你并没有发起过重置，请忽略那条消息</strong>
          —— 那是别人在冒用你的名义。
        </p>
      </div>

      <p className="text-sm text-ink-muted">
        <Link href="/login" className="text-brand hover:underline">返回登录</Link>
        {" · "}
        <Link href="/register" className="text-brand hover:underline">去注册</Link>
      </p>
    </div>
  );
}
