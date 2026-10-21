/** 读取受限公开角色资源，支持内置图片与管理员上传到存储的官方图片。 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { officialImageSchema } from "../shared/discovery";
import { storageRead } from "./storage";

/** 识别真实文件签名；大小和允许类型由发布规则另外校验。 */
export function officialImageMime(data: Buffer) {
  if (data.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
    return "image/jpeg";
  if (
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (/^GIF8[79]a/.test(data.toString("ascii", 0, 6))) return "image/gif";
  if (
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  throw new Error("请选择有效的 JPEG、PNG、GIF 或 WebP 图片");
}

/** 只读允许的资源路径并校验签名；新上传限制不追溯已保存的官方资源。 */
export async function readOfficialImage(imageUrl: string) {
  const image = officialImageSchema.parse(imageUrl);
  const data = image.startsWith("/files/")
    ? await storageRead(image.slice("/files/".length))
    : await readFile(
        path.resolve(
          process.cwd(),
          process.env.NODE_ENV === "production"
            ? "dist/public"
            : "client/public",
          image.slice(1)
        )
      );
  const mimeType = officialImageMime(data);
  return { data, mimeType };
}
