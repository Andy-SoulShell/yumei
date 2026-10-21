import { getPublishedProductConfig } from "../repositories/productConfig";
/** 公开内容读取与管理员草稿、上传、归档及统一发布 API。 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import {
  officialCharacterSchema,
  homepageSchema,
  officialIdSchema,
} from "../../shared/discovery";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { decodeBase64Upload, enforceUpload } from "../_core/uploads";
import { officialImageMime } from "../characterPresets";
import { putStagedMedia, publishMedia } from "../managedMedia";
import { getDb } from "../database";
import {
  archiveOfficialCharacter,
  getDiscoveryDraft,
  getPublishedDiscovery,
  publishDiscovery,
  saveHomepage,
  saveOfficialCharacter,
} from "../repositories/discovery";

const expectedRevision = z.number().int().positive();

export const discoveryRouter = router({
  get: publicProcedure.query(() => getPublishedDiscovery()),
  admin: router({
    getDraft: adminProcedure.query(() => getDiscoveryDraft()),
    saveCharacter: adminProcedure
      .input(
        z
          .object({ expectedRevision, character: officialCharacterSchema })
          .strict()
      )
      .mutation(({ ctx, input }) =>
        saveOfficialCharacter(
          ctx.administrator.id,
          input.expectedRevision,
          input.character
        )
      ),
    archiveCharacter: adminProcedure
      .input(z.object({ expectedRevision, id: officialIdSchema }).strict())
      .mutation(({ ctx, input }) =>
        archiveOfficialCharacter(
          ctx.administrator.id,
          input.expectedRevision,
          input.id
        )
      ),
    saveHomepage: adminProcedure
      .input(z.object({ expectedRevision, home: homepageSchema }).strict())
      .mutation(({ ctx, input }) =>
        saveHomepage(ctx.administrator.id, input.expectedRevision, input.home)
      ),
    publish: adminProcedure
      .input(z.object({ expectedRevision }).strict())
      .mutation(({ ctx, input }) =>
        publishDiscovery(ctx.administrator.id, input.expectedRevision)
      ),
    uploadImage: adminProcedure
      .input(z.object({ imageBase64: z.string().min(1) }).strict())
      .mutation(async ({ ctx, input }) => {
        const data = decodeBase64Upload(input.imageBase64);
        let mimeType: string;
        try {
          mimeType = officialImageMime(data);
          enforceUpload(
            (await getPublishedProductConfig()).uploads.official,
            data,
            mimeType
          );
        } catch (cause) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: cause instanceof Error ? cause.message : "图片无效",
          });
        }
        const ext = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
        const key = `official-${nanoid()}.${ext}`;
        await putStagedMedia(ctx.administrator.id, key, data, mimeType);
        // 官方媒体持久保留，可被多条草稿和历史发布内容引用。
        await (await getDb())!.transaction(tx =>
          publishMedia(tx, ctx.administrator.id, [key])
        );
        return { imageUrl: `/files/${key}`, mimeType };
      }),
  }),
});
