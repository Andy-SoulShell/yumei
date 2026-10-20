/** AI 人设草稿的输入输出边界；生成只修改草稿，不创建角色或图片。 */
import { z } from "zod";

export const generatedProfileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  personality: z.string().trim().min(1).max(2000),
  interests: z.string().trim().min(1).max(1000),
});

export const generateProfileInputSchema = z.object({
  mode: z.enum(["polish", "random"]),
  gender: z.enum(["female", "male"]),
  style: z.enum(["realistic", "anime"]),
  age: z.number().int().min(18).max(100),
  locale: z.enum(["zh-CN", "en", "ja", "ko"]),
  name: z.string().trim().max(100),
  personality: z.string().trim().max(2000),
  appearance: z.string().trim().max(6000),
  interests: z.string().trim().max(1000),
});

export type GenerateProfileInput = z.infer<typeof generateProfileInputSchema>;
export type GeneratedProfile = z.infer<typeof generatedProfileSchema>;
