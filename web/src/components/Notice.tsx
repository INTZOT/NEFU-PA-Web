/**
 * 操作结果提示条。
 *
 * 项目里多处表单都是「提交 → 303 重定向 → 用查询参数带回结果」，
 * 因此统一用这个组件渲染 ok / error 两种提示，避免样式与文案各处不一致。
 */
export function Notice({ ok, error }: { ok?: string; error?: string }) {
  return (
    <>
      {ok ? (
        <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {ok}
        </p>
      ) : null}
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </>
  );
}
