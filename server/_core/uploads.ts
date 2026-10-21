/** 校验上传文件的 Base64 编码，拒绝 Node 默认解码会静默忽略的损坏输入。 */
import express from "express";
import {
  acceptsUpload,
  uploadDescription,
} from "../../shared/operationalConfig";
import { getPublishedProductConfig } from "../repositories/productConfig";
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

/** 对已解码文件执行发布中的大小及 MIME 规则。 */
export function enforceUpload(
  limit: import("../../shared/operationalConfig").UploadLimit,
  data: Buffer,
  mimeType: string
) {
  if (!acceptsUpload(limit, { size: data.length, type: mimeType }))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `请选择 ${uploadDescription(limit).formats} 文件，最大 ${uploadDescription(limit).maxSize}`,
    });
}

/** 每次请求读取当前上限；不重启服务也能修改 JSON 与表单上传容量。 */
export function uploadBodyParser(): import("express").RequestHandler {
  return (req, res, next) => {
    if (!req.is(["application/json", "application/x-www-form-urlencoded"]))
      return next();
    void getPublishedProductConfig()
      .then(config => {
        const options = { limit: config.uploads.requestMaxBytes };
        express.json(options)(req, res, error => {
          if (error) return next(error);
          express.urlencoded({ ...options, extended: true })(req, res, next);
        });
      })
      .catch(next);
  };
}
