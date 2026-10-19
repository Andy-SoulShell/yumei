import type { Express, Request, Response } from "express";
import path from "node:path";
import { localFileStream, s3PresignedGetUrl } from "../storage";
import { ENV } from "./env";
import { log } from "./log";

/**
 * Serves stored files by key: local streams or short-lived S3 redirects.
 * External AI services fetch these URLs without a session. Uploaded media
 * uses random keys; possession of the URL grants read access.
 */

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

export function registerFileRoutes(app: Express) {
  app.get(/^\/files\/(.+)$/, async (req: Request, res: Response) => {
    const key = decodeURIComponent(req.params[0] ?? "");
    if (!key || key.includes("..") || path.isAbsolute(key)) {
      res.status(400).json({ error: "Invalid file key" });
      return;
    }

    try {
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
      // Immutable: keys are content-addressed by nanoid and never rewritten.
      res.setHeader("Cache-Control", "private, max-age=86400, immutable");
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
