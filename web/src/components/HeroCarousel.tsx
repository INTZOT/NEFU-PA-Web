"use client";

import { useEffect, useState } from "react";

/**
 * 首页 Hero 的背景照片轮播。
 *
 * 可读性是这个组件最需要处理的问题：
 *   直接把白字压在照片上，遇到浅色/高亮照片会完全看不清。
 *   因此做了三层：
 *     1. 照片本身降到 55% 不透明度，并叠一层品牌蓝 —— 保证整体色调仍是社团蓝；
 *     2. 底部再加一层深色渐变 —— 缓解上下明暗差异；
 *     3. 文字放在**毛玻璃卡片**里（backdrop-blur）—— 这是最终的可读性保障。
 *
 * 动效细节：
 *   - 交叉淡入淡出（opacity 过渡），不是硬切；
 *   - 尊重 prefers-reduced-motion：用户若在系统里关闭动画，则不轮播、不淡入。
 */

const INTERVAL_MS = 6000;
const FADE_MS = 1200;

export function HeroCarousel({ filenames }: { filenames: string[] }) {
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    // 系统设置了「减少动态效果」就不轮播，只显示第一张
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAnimate(!mq.matches);
    if (mq.matches) return;

    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % filenames.length);
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [filenames.length]);

  if (filenames.length === 0) return null;

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {filenames.map((name, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={name}
          src={`/api/photos/${name}`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            // 照片保持较高不透明度：压低会让照片变成「蓝色滤镜下的灰影」，失去意义
            opacity: i === index ? 0.9 : 0,
            transition: animate ? `opacity ${FADE_MS}ms ease-in-out` : undefined,
          }}
        />
      ))}

      {/*
       * 遮罩分两层，各司其职：
       *   1. 品牌蓝 45%：保留社团色调，但不至于把照片压成一片蓝；
       *   2. 斜向深色渐变：统一明暗，保证任何一张照片上的白字都够亮。
       * 之前用的是 70% 纯蓝，照片形同虚设，故下调。
       */}
      <div className="absolute inset-0 bg-brand/45" />
      <div className="absolute inset-0 bg-gradient-to-tr from-black/55 via-black/25 to-transparent" />
    </div>
  );
}
