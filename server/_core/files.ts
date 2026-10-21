/** 通过存储键提供媒体访问，本地流式返回，S3 签名有效期读取发布配置。 */

import type { Express, Request, Response } from "express";
import path from "node:path";
import { localFileStream, s3PresignedGetUrl } from "../storage";
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

/**
 * 注册不要求会话的媒体读取路由，持有完整文件地址即可读取。
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
      if (await isMediaPendingDeletion(key)) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      if (ENV.storageDriver === "s3") {
        const url = await s3PresignedGetUrl(key);
        res.redirect(302, url);
        return;
      }

      const stream = localFileStream(key);
      if (!stream) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const mime = MIME_BY_EXT[path.extname(key).toLowerCase()];
      res.setHeader("Content-Type", mime ?? "application/octet-stream");
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
