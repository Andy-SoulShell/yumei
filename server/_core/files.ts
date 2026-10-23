import { getSessionUser } from "./auth";
import { canReadMedia } from "../mediaAuthorization";
/** 通过存储键提供媒体访问，本地流式返回，S3 签名有效期读取发布配置。 */

import type { Express, Request, Response } from "express";
import path from "node:path";
import { localFileStream, localFileSize, s3PresignedGetUrl } from "../storage";
import { isMediaPendingDeletion } from "../mediaCleanup";
import { ENV } from "./env";
import { log } from "./log";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".mpeg": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "audio/mp4",
  ".webm": "audio/webm",
  ".ogg": "audio/ogg",
};

/** 解析单段 HTTP 字节范围；包含无效或不可满足的范围时返回 null。 */
export function parseByteRange(header: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;
  const suffix = !match[1];
  const start = suffix
    ? Math.max(0, size - Number(match[2]))
    : Number(match[1]);
  const end =
    suffix || !match[2] ? size - 1 : Math.min(size - 1, Number(match[2]));
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start > end ||
    start >= size ||
    (suffix && Number(match[2]) === 0)
  )
    return null;
  return { start, end };
}

/**
 * 官方素材公开；个人媒体通过真实会话及资源归属校验后才可读取。
 *
 * @remarks Express 已解码参数，此处不重复解码；存储和读取异常统一返回错误响应。
 */
export function registerFileRoutes(app: Express) {
  app.get(/^\/files\/(.+)$/, async (req: Request, res: Response) => {
    try {
      const key = req.params[0] ?? "";
      if (!key || key.includes("..") || path.isAbsolute(key)) {
        res.status(400).json({ error: "Invalid file key" });
        return;
      }
      res.setHeader("Cache-Control", "private, no-store");
      const download = req.query.download === "1";
      if (download) res.setHeader("Content-Disposition", "attachment");
      const user = key.startsWith("official-")
        ? null
        : await getSessionUser(req);
      if (
        !(await canReadMedia(key, user?.id)) ||
        (await isMediaPendingDeletion(key))
      ) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      if (ENV.storageDriver === "s3") {
        const url = await s3PresignedGetUrl(key, download);
        res.redirect(302, url);
        return;
      }

      const size = await localFileSize(key);
      if (size === null) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const mime =
        key.startsWith("video-") && key.endsWith(".mp4")
          ? "video/mp4"
          : MIME_BY_EXT[path.extname(key).toLowerCase()];
      res.setHeader("Content-Type", mime ?? "application/octet-stream");
      res.setHeader("Accept-Ranges", "bytes");
      const range = req.headers.range
        ? parseByteRange(req.headers.range, size)
        : undefined;
      if (range === null) {
        res.setHeader("Content-Range", `bytes */${size}`);
        res.status(416).end();
        return;
      }
      if (range) {
        res.status(206);
        res.setHeader(
          "Content-Range",
          `bytes ${range.start}-${range.end}/${size}`
        );
      }
      res.setHeader(
        "Content-Length",
        range ? range.end - range.start + 1 : size
      );
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      const stream = localFileStream(key, range);
      if (!stream) {
        res.status(404).end();
        return;
      }
      res.on("close", () => stream.destroy());
      // 避免浏览器在删除后继续从长期 HTTP 缓存展示私人媒体。
      res.setHeader("Cache-Control", "private, no-store");
      stream.on("error", () => {
        if (!res.headersSent) res.status(500).json({ error: "Read failed" });
        res.end();
      });
      stream.pipe(res);
    } catch (error) {
      log.error("[files] read failed", error);
      if (!res.headersSent) res.status(500).json({ error: "Read failed" });
    }
  });
}
