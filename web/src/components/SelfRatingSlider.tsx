"use client";

import { useState } from "react";

/**
 * 自评分滑块。
 *
 * 为什么是客户端组件：需要把滑块值实时反映到界面上的数字与档位。
 * 原先滑块是「非受控」的（只有 defaultValue），拖动时数字纹丝不动，
 * 用户无法确认自己究竟选了多少，必须保存后才知道 —— 这是个真实的体验缺陷。
 *
 * 提交方式保持不变：仍是原生表单 POST → 服务端处理 → 303 重定向。
 * 这里只接管「显示」，不改变任何写入逻辑。
 *
 * 关于档位话术：D-21 定了五档仅作**选分时的参考**、不跟随展示。
 * 因此这里在拖动时显示档位（属于选分场景），而页面上不再另外跟随展示。
 */

const TIERS = [
  { max: 200, label: "小白" },
  { max: 400, label: "新手" },
  { max: 600, label: "熟手" },
  { max: 800, label: "高手" },
  { max: 1000, label: "大师" },
];

function tierOf(value: number): string {
  return TIERS.find((t) => value <= t.max)?.label ?? "大师";
}

export function SelfRatingSlider({ initial }: { initial: number }) {
  const [value, setValue] = useState(initial);
  const changed = value !== initial;

  return (
    <form action="/api/me/self-rating" method="post" className="mt-3 space-y-3">
      <div className="flex items-center gap-4">
        <input
          type="range"
          name="selfRating"
          min={0}
          max={1000}
          step={10}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-line-strong accent-brand"
        />

        {/* 实时数值：拖动时立即变化，这是本次改动要解决的核心问题 */}
        <div className="w-28 shrink-0 text-right">
          <span className="text-2xl font-bold tabular-nums text-brand">{value}</span>
          <span className="ml-1 text-xs text-ink-subtle">/ 1000</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
        <span>
          当前档位：
          <span className="font-medium text-ink">{tierOf(value)}</span>
        </span>
        {changed ? (
          <span className="text-warn">未保存（原值 {initial}）</span>
        ) : (
          <span className="text-ink-subtle">已保存</span>
        )}
      </div>

      <p className="text-xs text-ink-subtle">
        档位范围：小白 0–200 · 新手 200–400 · 熟手 400–600 · 高手 600–800 · 大师 800–1000
      </p>

      <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong">
        保存自评分
      </button>
    </form>
  );
}
