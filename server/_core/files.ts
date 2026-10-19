import type { Express, Request, Response } from "express";
import path from "node:path";
import { localFileStream, s3PresignedGetUrl } from "../storage";
import { ENV } from "./env";
import { log } from "./log";

/**
 * Read path for stored files (M1-2).
 *
 * All persisted file URLs look like `${PUBLIC_URL}/files/<key>`.
 *   - local driver: stream the file from disk;
 *   - s3 driver: 302 to a short-lived presigned URL, so buckets stay
 *     private and nothing long-lived leaks into chat logs.
 *
 * Keys embed a nanoid, so URLs are unguessable — the same model the
 * old Forge proxy used. External AI services (fal.ai reference images)
 * must be able to fetch these URLs, so no session is required here.
 * Per-user ACLs / app-signed URLs are issue #12.
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
