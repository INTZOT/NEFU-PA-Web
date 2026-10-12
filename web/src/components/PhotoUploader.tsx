"use client";

import { useRef, useState } from "react";

/**
 * 照片上传（含浏览器端压缩）。
 *
 * 为什么在浏览器端压缩（D-31 第五条）：
 *   手机照片动辄 5–10MB，直接上传会拖慢页面、占满磁盘。
 *   服务端重新编码需要在容器里装 sharp 之类的图像库，会显著增大镜像体积 ——
 *   本项目的部署机磁盘与内存都紧张，不值得。
 *   canvas 压缩零依赖即可完成。
 *
 * 压缩参数：长边 ≤ 1920px、JPEG 质量 0.85。
 * 只有管理员能上传，不存在恶意绕过压缩的动机；服务端仍有大小上限兜底。
 */

const MAX_EDGE = 1920;
const QUALITY = 0.85;

async function compress(file: File): Promise<File> {
  // 非图片或本来就是小图，直接返回
  if (!file.type.startsWith("image/")) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

  // 本来就不大：不重新编码，避免无谓的画质损失
  if (scale === 1 && file.size <= 1.5 * 1024 * 1024) return file;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  if (!blob) return file;

  // 压缩后反而更大就别用（小图重编码可能如此）
  if (blob.size >= file.size) return file;

  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
    type: "image/jpeg",
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function PhotoUploader({ action }: { action: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = inputRef.current;
    if (!input?.files?.[0]) return;

    const original = input.files[0];
    setBusy(true);
    setNote(`正在压缩…（原始 ${formatSize(original.size)}）`);

    try {
      const compressed = await compress(original);
      setNote(
        `已压缩为 ${formatSize(compressed.size)}，正在上传…`,
      );

      // 用 fetch 提交压缩后的文件，再手动跟随服务端返回的重定向。
      // 这样既能替换文件内容，又保留「POST → 303 → 跳转」的既有语义
      // （服务端逻辑不用为客户端压缩做任何改动）。
      const form = e.currentTarget;
      const data = new FormData(form);
      data.set("file", compressed, compressed.name);

      const res = await fetch(form.action, {
        method: "POST",
        body: data,
        redirect: "manual",
      });
      const location = res.headers.get("location");
      window.location.href = location ?? form.action.replace("/api/admin/photos", "/admin/photos");
    } catch (err) {
      setBusy(false);
      setNote(err instanceof Error ? `压缩失败：${err.message}` : "压缩失败");
      input.setAttribute("name", "file");
    }
  }

  return (
    <form action={action} method="post" encType="multipart/form-data" onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink" htmlFor="photo-file">
          选择图片
        </label>
        <input
          id="photo-file"
          ref={inputRef}
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp"
          required
          className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:text-brand-ink"
        />
        <p className="mt-1 text-xs text-ink-subtle">
          支持 JPG / PNG / WebP。上传前会自动压缩到长边 1920px 以内，无需自己处理。
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-ink" htmlFor="caption">
          说明（建议填写）
        </label>
        <input
          id="caption"
          name="caption"
          maxLength={80}
          placeholder="如：2026 春季友谊赛合影"
          className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="featured" className="h-4 w-4 rounded border-line-strong" />
        设为首页精选
      </label>

      {note ? <p className="text-xs text-ink-muted">{note}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "处理中…" : "上传"}
      </button>
    </form>
  );
}
