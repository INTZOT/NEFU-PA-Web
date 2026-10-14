import Link from "next/link";
import { Notice } from "@/components/Notice";
import { ResetWaiter } from "@/components/ResetWaiter";

export const metadata = { title: "等待确认" };

/**
 * 找回密码的等待页（D-45 方案 B）。
 *
 * 群里确认后，**在本页就地弹出改密表单** —— 不发链接、不跳转。
 * 这样凭据（httpOnly cookie）始终留在发起重置的那个浏览器里。
 */
export default async function ForgotWaitingPage({
  searchParams,
}: {
  searchParams: Promise<{ qq?: string; error?: string }>;
}) {
  const { qq, error } = await searchParams;
  const safeQq = (qq ?? "").replace(/\D/g, "");

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="text-xl font-bold">最后一步：到群里确认</h1>
        <p className="mt-1 text-sm text-ink-muted">
          如果该 QQ 号是社团成员，机器人已经在群里 @ 了他。
          请在群里回复「<strong>确认重置</strong>」，
          然后<strong>回到本页</strong>设置新密码。
        </p>
      </div>

      <Notice error={error} />

      {safeQq ? <ResetWaiter qq={safeQq} /> : null}

      <div className="space-y-1 text-xs text-ink-subtle">
        <p>
          · 必须在<strong>当前这个浏览器</strong>里完成改密 ——
          这是为了确保「发起重置的人」与「群里确认的人」是同一个。
        </p>
        <p>· 确认有效期 10 分钟，超时后回来重新发起即可。</p>
        <p>
          · <strong>如果群里有人 @ 你而你并没有发起过重置，请不要回复</strong>
          —— 那是别人在冒用你的名义。
        </p>
      </div>

      <p className="text-sm text-ink-muted">
        <Link href="/login" className="text-brand hover:underline">
          返回登录
        </Link>
      </p>
    </div>
  );
}
