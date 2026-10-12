"use client";

import { useEffect, useState } from "react";

/**
 * 登录二维码（掉线时显示）。
 *
 * 为什么必须自动刷新：
 *   NapCat 的登录二维码**约 2 分钟失效**。若页面只加载一次，
 *   超管打开面板时看到的很可能是已经过期的码 —— 扫了没反应，
 *   还以为是坏了。因此这里定时重新拉取。
 *
 * 缓存破坏：每次请求带一个新的查询参数，绕开浏览器与中间层缓存。
 * （服务端也设了 no-store，这里是双保险。）
 */
const REFRESH_MS = 30_000;

export function BotQrPanel() {
  const [tick, setTick] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  if (failed) {
    return (
      <p className="text-sm text-ink-muted">
        暂时取不到二维码。NapCat 可能尚未开始生成，稍后自动重试。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="inline-block rounded-xl border border-line bg-surface p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          // key 变化会强制浏览器重新请求，避免复用旧图
          key={tick}
          src={`/api/admin/bot/qr?t=${tick}`}
          alt="QQ 登录二维码"
          width={220}
          height={220}
          className="h-[220px] w-[220px]"
          onError={() => setFailed(true)}
        />
      </div>
      <p className="text-xs text-ink-subtle">每 30 秒自动刷新，直接扫当前显示的即可。</p>
    </div>
  );
}
