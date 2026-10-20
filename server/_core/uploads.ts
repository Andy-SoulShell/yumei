/** 校验上传文件的 Base64 编码，拒绝 Node 默认解码会静默忽略的损坏输入。 */
import { TRPCError } from "@trpc/server";

/** 解码非空标准 Base64，允许省略末尾填充；不校验文件格式或 MIME 内容。 */
export function decodeBase64Upload(value: string): Buffer {
  const invalid = () =>
    new TRPCError({
      code: "BAD_REQUEST",
      message: "上传内容不是有效的 Base64 文件",
    });
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 === 1)
    throw invalid();
  const decoded = Buffer.from(value, "base64");
  const canonical = decoded.toString("base64");
  if (
    !decoded.length ||
    value !== (value.includes("=") ? canonical : canonical.replace(/=+$/, ""))
  )
    throw invalid();
  return decoded;
}
