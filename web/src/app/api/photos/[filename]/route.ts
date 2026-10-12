import { NextResponse } from "next/server";
import { readBytes, contentTypeOf } from "@/modules/photo/service";

/**
 * 读取照片文件。
 *
 * 路径形如 /api/photos/<uuid>.jpg。
 * 文件名里没有用户可控的成分（服务端生成的 UUID + 白名单后缀），
 * 且 readBytes 内部再做一次 basename 校验作为纵深防御。
 *
 * 缓存：文件名是 UUID，内容不会变，因此可以长缓存。
 * 这对图片尤其重要 —— 相册页一次要加载多张。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  const bytes = await readBytes(decodeURIComponent(filename));
  if (!bytes) return new NextResponse("Not Found", { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": contentTypeOf(filename),
      "content-length": String(bytes.length),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
