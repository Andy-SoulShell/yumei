/** 个人资料的前后端共用输入规则；用户名作为显示名称，不参与登录。 */
import { z } from "zod";

export const USER_NAME_MAX_LENGTH = 50;
export const userNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(USER_NAME_MAX_LENGTH)
  .refine(value =>
    Array.from(value).every(character => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
  );

/** 省略头像表示保留，null 表示移除；新头像只接收文件，不接受任意 URL。 */
export const userProfileSchema = z
  .object({
    name: userNameSchema,
    avatar: z
      .object({
        imageBase64: z.string().min(1),
        mimeType: z.enum([
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
        ]),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
