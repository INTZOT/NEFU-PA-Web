import Link from "next/link";

/**
 * 成员姓名链接 —— 指向 /members/[id]。
 *
 * 为什么单独抽成组件而不是到处写 <Link>：
 *   全站有多处展示成员姓名（排行榜、约球房间、活动搭档等）。
 *   若各写各的，样式会漂移，将来改跳转规则也要改多处。
 */
export function MemberLink({
  userId,
  name,
  className = "",
}: {
  userId: string;
  name: string;
  className?: string;
}) {
  return (
    <Link
      href={`/members/${userId}`}
      className={`text-ink transition hover:text-brand hover:underline ${className}`}
    >
      {name}
    </Link>
  );
}
