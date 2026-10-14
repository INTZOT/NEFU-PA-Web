import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { ConfirmWaiter } from "@/components/ConfirmWaiter";

export const metadata = { title: "等待确认" };

/** 注册的「等待群内确认」页（D-45）。 */
export default async function RegisterWaitingPage({
  searchParams,
}: {
  searchParams: Promise<{ qq?: string }>;
}) {
  const { qq } = await searchParams;
  if (!qq) redirect("/register");

  // 已经登录（比如确认完成后回退到本页）→ 直接进站
  const user = await getCurrentUser();
  if (user) redirect("/me?welcome=1");

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="text-xl font-bold">最后一步：到群里确认</h1>
        <p className="mt-1 text-sm text-ink-muted">
          机器人已经在社团群里 @ 了你。
          <strong>请到群里回复「确认注册」</strong>，注册就会完成。
        </p>
      </div>

      <ConfirmWaiter
        qq={qq}
        endpoint="/api/auth/register/status"
        doneStatus="done"
        onDoneHref="/me?welcome=1"
        doneText="✅ 注册成功，正在进入…"
      />

      <div className="space-y-1 text-xs text-ink-subtle">
        <p>· 没有收到 @？确认你填的 QQ 号是对的，并在同一个群里。</p>
        <p>· 确认有效期 10 分钟，超时后回来重新发起即可。</p>
      </div>

      <p className="text-sm text-ink-muted">
        填错了？
        <Link href="/register" className="text-brand hover:underline">
          重新填写
        </Link>
      </p>
    </div>
  );
}
