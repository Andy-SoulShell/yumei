/** 所有官方素材入口使用同一发布上传规则及管理 API。 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useProductConfig } from "@/features/product/useProductConfig";
import { acceptsUpload, uploadDescription } from "@shared/operationalConfig";
export function useOfficialUpload(onError: (message: string) => void) {
  const policy = useProductConfig(),
    mutation = trpc.discovery.admin.uploadImage.useMutation();
  const [pending, setPending] = useState(false);
  const uploadFile = async (file: File) => {
    setPending(true);
    try {
      const rule = policy.raw?.uploads.official;
      if (!rule) throw new Error("上传规则尚未加载");
      if (!acceptsUpload(rule, file)) {
        const info = uploadDescription(rule);
        throw new Error(`请选择 ${info.formats}，最大 ${info.maxSize}`);
      }
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("文件读取失败"));
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.readAsDataURL(file);
      });
      const result = await mutation.mutateAsync({ imageBase64: base64 });
      onError("");
      return result.imageUrl;
    } catch (error) {
      onError(error instanceof Error ? error.message : "上传失败");
      throw error;
    } finally {
      setPending(false);
    }
  };
  return {
    pending,
    uploadFile,
    ready: !!policy.raw,
    accept: policy.raw?.uploads.official.mimeTypes.join(","),
  };
}
