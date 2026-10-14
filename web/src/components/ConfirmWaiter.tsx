"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * 「等待群内确认」的轮询组件（D-45）。
 *
 * 为什么要轮询而不是 WebSocket：确认发生在**机器人**那一侧（它收到群消息后建号），
 * 网站无从被通知。2 秒一次的轮询对这个量级（社团注册）完全够用，
 * 也避免为一件低频的事引入长连接。
 */
export function ConfirmWaiter({
  qq,
  endpoint,
  doneStatus,
  onDoneHref,
  doneText,
}: {
  qq: string;
  /** 轮询接口（相对路径，qq 由本组件拼上）。 */
  endpoint: string;
  /** 哪个状态值代表完成。 */
  doneStatus: string;
  /** 完成后跳哪儿。 */
  onDoneHref: string;
  doneText: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"pending" | "done" | "expired" | "missing">("pending");

  useEffect(() => {
    let stopped = false;

    async function tick() {
      try {
        const res = await fetch(`${endpoint}?qq=${encodeURIComponent(qq)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { status?: string };
        if (stopped || !data.status) return;

        if (data.status === doneStatus) {
          setState("done");
          stopped = true;
          // 完成后再刷新一次路由，让服务端把新状态（含登录态）渲染进去
          router.replace(onDoneHref);
          return;
        }
        if (data.status === "expired" || data.status === "missing") {
          setState(data.status);
          stopped = true;
        }
      } catch {
        // 网络抖动忽略，下一轮再试
      }
    }

    void tick();
    const timer = setInterval(() => {
      if (!stopped) void tick();
    }, 2000);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [qq, endpoint, doneStatus, onDoneHref, router]);

  if (state === "done") {
    return (
      <p className="rounded-xl border border-ok/25 bg-ok-soft p-4 text-sm text-ok">
        {doneText}
      </p>
    );
  }

  if (state === "expired" || state === "missing") {
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-warn/25 bg-warn-soft p-4 text-sm text-ink">
          这次确认已超时（有效期 10 分钟）。请重新发起。
        </p>
        <Link href="/register" className="inline-block text-brand hover:underline">
          ← 返回重新发起
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      <span className="text-ink-muted">等待你在群里确认…（本页会自动跳转）</span>
    </div>
  );
}
