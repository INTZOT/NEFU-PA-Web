/**
 * 社团照片：元数据在数据库，文件本体在命名卷（D-31）。
 *
 * 为什么分开存：
 *   - 二进制不入库：会撑大数据库、拖慢备份
 *   - 不放 web/public：那是构建进镜像的，下次部署会丢
 *   - 命名卷：与项目已有的 db_data / napcat_config 同一套概念
 *
 * 安全要点：
 *   - 文件名由**服务端生成**（UUID + 白名单后缀），不采用用户提供的名字
 *     → 从根上杜绝路径穿越
 *   - 读取时仍做一次 basename 校验作为纵深防御
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { query, queryOne } from "@/lib/db";

/** 卷挂载点（docker-compose 里配置）。 */
export const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";

/** 单张照片的大小上限。浏览器端已压缩（D-31 第五条），这里是兜底。 */
export const MAX_BYTES = 8 * 1024 * 1024;

/** 允许的格式与对应的魔数（文件头）。 */
const SIGNATURES: { ext: string; mime: string; magic: number[] }[] = [
  { ext: "jpg", mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { ext: "png", mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { ext: "webp", mime: "image/webp", magic: [0x52, 0x49, 0x46, 0x46] }, // RIFF…WEBP
];

export interface Photo {
  id: string;
  filename: string;
  caption: string | null;
  isFeatured: boolean;
  width: number | null;
  height: number | null;
  createdAt: string;
}

interface Row {
  id: string;
  filename: string;
  caption: string | null;
  is_featured: boolean;
  width: number | null;
  height: number | null;
  created_at: string;
}

function toPhoto(r: Row): Photo {
  return {
    id: r.id,
    filename: r.filename,
    caption: r.caption,
    isFeatured: r.is_featured,
    width: r.width,
    height: r.height,
    createdAt: r.created_at,
  };
}

const COLUMNS = `id, filename, caption, is_featured, width, height, created_at`;

export async function listAll(): Promise<Photo[]> {
  const rows = await query<Row>(
    `SELECT ${COLUMNS} FROM photos ORDER BY created_at DESC`,
  );
  return rows.map(toPhoto);
}

export async function listFeatured(limit = 6): Promise<Photo[]> {
  const rows = await query<Row>(
    `SELECT ${COLUMNS} FROM photos WHERE is_featured ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(toPhoto);
}

export async function listRecent(limit = 12): Promise<Photo[]> {
  const rows = await query<Row>(
    `SELECT ${COLUMNS} FROM photos ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(toPhoto);
}

export async function getById(id: string): Promise<Photo | null> {
  const row = await queryOne<Row>(`SELECT ${COLUMNS} FROM photos WHERE id = $1`, [id]);
  return row ? toPhoto(row) : null;
}

// ---------------------------------------------------------------------------
// 写入
// ---------------------------------------------------------------------------

export type SaveResult = { ok: true; photo: Photo } | { ok: false; error: string };

/** 识别文件类型（按魔数，不信任浏览器给的 MIME）。 */
function detectType(buf: Buffer): { ext: string; mime: string } | null {
  for (const sig of SIGNATURES) {
    if (sig.magic.every((byte, i) => buf[i] === byte)) {
      // WebP 需再确认第 8–11 字节是 "WEBP"
      if (sig.ext === "webp") {
        if (buf.subarray(8, 12).toString("ascii") !== "WEBP") continue;
      }
      return { ext: sig.ext, mime: sig.mime };
    }
  }
  return null;
}

/**
 * 从 PNG/JPEG 头部读出宽高（避免引入图像库）。
 *
 * 只用于展示时的占位尺寸，读不出就留空 —— 不影响主流程。
 */
function readDimensions(buf: Buffer, ext: string): { width: number; height: number } | null {
  try {
    if (ext === "png") {
      // IHDR 从第 16 字节开始：宽 4 字节、高 4 字节（大端）
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (ext === "jpg") {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        // SOF0–SOF3 / SOF5–SOF7 / SOF9–SOF11（这些段里含尺寸）
        const isSOF =
          (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb);
        if (isSOF) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch {
    /* 读不出就算了 */
  }
  return null;
}

/**
 * 保存一张照片。
 *
 * @param caption  简短说明（可空）
 * @param featured 是否上首页精选
 */
export async function save(
  bytes: Buffer,
  caption: string | null,
  featured: boolean,
  uploadedBy: string,
): Promise<SaveResult> {
  if (bytes.length === 0) return { ok: false, error: "文件为空" };
  if (bytes.length > MAX_BYTES) {
    return { ok: false, error: `图片过大（上限 ${Math.round(MAX_BYTES / 1024 / 1024)}MB）` };
  }

  const type = detectType(bytes);
  if (!type) return { ok: false, error: "只支持 JPG / PNG / WebP 图片" };

  // 文件名由服务端生成：UUID + 白名单后缀。不用用户提供的名字。
  const filename = `${randomUUID()}.${type.ext}`;
  const dims = readDimensions(bytes, type.ext);

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(join(UPLOAD_DIR, filename), bytes);

  const row = await queryOne<Row>(
    `INSERT INTO photos (filename, caption, is_featured, width, height, bytes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${COLUMNS}`,
    [filename, caption, featured, dims?.width ?? null, dims?.height ?? null, bytes.length, uploadedBy],
  );
  if (!row) return { ok: false, error: "保存失败" };
  return { ok: true, photo: toPhoto(row) };
}

/** 删除照片（同时删文件）。 */
export async function remove(id: string): Promise<void> {
  const photo = await getById(id);
  if (!photo) return;
  await query("DELETE FROM photos WHERE id = $1", [id]);
  try {
    await unlink(join(UPLOAD_DIR, basename(photo.filename)));
  } catch {
    // 文件可能已经不在了；元数据已删即可，不阻断
  }
}

export async function setFeatured(id: string, featured: boolean): Promise<void> {
  await query("UPDATE photos SET is_featured = $2 WHERE id = $1", [id, featured]);
}

export async function updateCaption(id: string, caption: string | null): Promise<void> {
  await query("UPDATE photos SET caption = $2 WHERE id = $1", [id, caption]);
}

/** 读取照片字节（供 /api/photos/[filename] 使用）。 */
export async function readBytes(filename: string): Promise<Buffer | null> {
  // 纵深防御：即使用户能构造 filename，也不允许越出目录
  const safe = basename(filename);
  if (safe !== filename) return null;
  try {
    return await readFile(join(UPLOAD_DIR, safe));
  } catch {
    return null;
  }
}

/** 按后缀推断 Content-Type（缓存用）。 */
export function contentTypeOf(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}
