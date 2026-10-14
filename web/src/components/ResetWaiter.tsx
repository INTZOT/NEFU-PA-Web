"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * 找回密码的等待 + 改密（D-45 方案 B）。
 *
 * 群里确认后**就地**显出改密表单，不发链接、不跳转 ——
 * 凭据（httpOnly cookie）因此始终留在发起重置的那个浏览器里。
 *
 * 轮询而非长连接：确认发生在机器人那一侧，网站无从被通知；
 * 2 秒一次对这个量级完全够用。
 */
export function ResetWaiter({ qq }: { qq: string }) {
  const [state, setState] = useState<"pending" | "confirmed" | "none">("pending");

  useEffect(() => {
    let stopped = false;

    async function tick() {
      try {
        const res = await fetch(`/api/auth/forgot/status?qq=${encodeURIComponent(qq)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { status?: string };
        if (stopped || !data.status) return;

        if (data.status === "confirmed") {
          setState("confirmed");
          stopped = true;
        } else if (data.status === "none") {
          setState("none");
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
  }, [qq]);

  if (state === "confirmed") {
    return (
      <form
        action="/api/auth/reset"
        method="post"
        className="space-y-4 rounded-xl border border-brand/30 bg-brand-soft/40 p-4"
      >
        <p className="text-sm text-ink">
          ✅ 群里已确认。请设置新密码（<strong>就在本页完成</strong>）。
        </p>
        <input type="hidden" name="qq" value={qq} />

        <label className="block">
          <span className="mb-1 block text-sm font-medium">新密码</span>
          <input
            name="password"
            type="password"
            required
            minLength={6}
            className="w-full rounded border border-line-strong px-3 py-2 outline-none focus:border-brand"
          />
          <span className="mt-1 block text-xs text-ink-muted">至少 6 位</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">再输一次</span>
          <input
            name="confirm"
            type="password"
            required
            minLength={6}
            className="w-full rounded border border-line-strong px-3 py-2 outline-none focus:border-brand"
          />
        </label>

        <button type="submit" className="w-full rounded bg-brand px-4 py-2 text-white">
          保存新密码
        </button>
        <p className="text-xs text-ink-subtle">
          保存后所有设备上的登录都会失效，需要用新密码重新登录。
        </p>
      </form>
    );
  }

  if (state === "none") {
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-warn/25 bg-warn-soft p-4 text-sm text-ink">
          这次重置申请已超时或被取消（有效期 10 分钟）。请重新发起。
        </p>
        <Link href="/forgot" className="inline-block text-brand hover:underline">
          ← 重新发起找回密码
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      <span className="text-ink-muted">等待你在群里确认…（确认后本页会出现改密表单）</span>
    </div>
  );
}
