/** 仅下载成功响应，保留实际图片格式，延后释放 Blob 兼容移动浏览器。 */
export async function downloadImage(imageUrl: string, id: number) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("Image download failed");
  const blob = await response.blob();
  if (
    !blob.size ||
    (blob.type &&
      !blob.type.startsWith("image/") &&
      blob.type !== "application/octet-stream")
  )
    throw new Error("Invalid image response");
  const extension =
    (
      {
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/avif": "avif",
      } as Record<string, string>
    )[blob.type] || "png";
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `selfie-${id}.${extension}`;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}
