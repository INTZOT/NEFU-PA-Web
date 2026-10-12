import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * 共享 UI 组件。
 *
 * 为什么集中在这里：界面里同一个视觉元素被重复写了几十遍
 * （卡片容器 51 处、按钮 62 处、徽章 30 处、输入框 27 处、页面标题 26 处）。
 * 重复带来的代价是：改一次样式要在几百处手改，必然漏掉几处、界面花掉。
 *
 * 因此这些组件只做两件事：
 *   1. 把重复的样式收敛到一处；
 *   2. 用上一节的语义令牌（brand / surface / ink / line…），而不是写死的颜色。
 * 它们不含业务逻辑，也不改变任何页面的行为。
 */

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

const cardBase =
  "rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(16,32,48,0.04)]";

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={`${cardBase} ${className}`}>{children}</div>;
}

/** 可点击的卡片：悬停时描边变主色、阴影加重，给出明确的交互反馈。 */
export function CardLink({
  href,
  className = "",
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`${cardBase} block transition duration-150 hover:-translate-y-0.5 hover:border-brand hover:shadow-[0_6px_16px_rgba(0,116,203,0.12)] ${className}`}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-strong active:bg-brand-strong disabled:bg-line-strong",
  secondary:
    "border border-line-strong bg-surface text-ink hover:border-brand hover:text-brand",
  danger: "bg-danger text-white hover:brightness-110",
  ghost: "text-ink-muted hover:bg-surface-muted hover:text-ink",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition duration-150 disabled:cursor-not-allowed disabled:opacity-60";

/** 按钮。默认是 <button>，传 href 则渲染成链接。 */
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
} & ComponentProps<"button">) {
  return (
    <button
      className={`${buttonBase} ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`}
      {...rest}
    />
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`${buttonBase} ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

export type BadgeTone =
  | "brand"
  | "accent"
  | "info"
  | "ok"
  | "warn"
  | "danger"
  | "muted";

/**
 * 徽章。
 *
 * accent 用的是匹克球高光的荧光黄绿 —— 只在这类小面积色块上使用，
 * 搭配深色文字保证可读性（白底上直接用它写字是看不清的）。
 */
const badgeTones: Record<BadgeTone, string> = {
  brand: "bg-brand text-white",
  accent: "bg-accent text-accent-ink",
  info: "bg-brand-soft text-brand-ink",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  muted: "bg-surface-muted text-ink-muted",
};

export function Badge({
  tone = "muted",
  className = "",
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ${badgeTones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 表单
// ---------------------------------------------------------------------------

const controlBase =
  "w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle transition focus:border-brand focus:outline-none";

export function Input({ className = "", ...rest }: ComponentProps<"input">) {
  return <input className={`${controlBase} ${className}`} {...rest} />;
}

export function Textarea({ className = "", ...rest }: ComponentProps<"textarea">) {
  return <textarea className={`${controlBase} ${className}`} {...rest} />;
}

export function Select({ className = "", ...rest }: ComponentProps<"select">) {
  return <select className={`${controlBase} ${className}`} {...rest} />;
}

/** 带标签与可选提示的表单字段。 */
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-xs text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 页面标题
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  action,
  backHref,
  backLabel,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="space-y-1">
      {backHref ? (
        <Link
          href={backHref}
          className="inline-block text-sm text-ink-muted transition hover:text-brand"
        >
          ← {backLabel ?? "返回"}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-ink-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 空状态
// ---------------------------------------------------------------------------

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? (
        <div className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{description}</div>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
