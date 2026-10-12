/**
 * 操作结果提示条。
 *
 * 项目里多处表单都是「提交 → 303 重定向 → 用查询参数带回结果」，
 * 因此统一用这个组件渲染 ok / error 两种提示，避免样式与文案各处不一致。
 *
 * 加了图标：纯色块在密集的页面里容易被忽略，一个勾/叹号能显著提升「被看到」的概率。
 * 图标用内联 SVG，不引第三方图标库（保持依赖最小）。
 */

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden>
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden>
      <path
        fillRule="evenodd"
        d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1Zm0 8.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function Notice({ ok, error }: { ok?: string; error?: string }) {
  return (
    <>
      {ok ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-ok/20 bg-ok-soft px-3.5 py-2.5 text-sm text-ok"
        >
          <CheckIcon />
          <span>{ok}</span>
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
        >
          <AlertIcon />
          <span>{error}</span>
        </p>
      ) : null}
    </>
  );
}
