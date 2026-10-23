import { createHash } from "node:crypto";
import { commerceError } from "../commerceErrors";
import { getPublishedProductConfig } from "../repositories/productConfig";
import { characterFieldsError } from "../../shared/experienceConfig";
import { createCoinCheckout } from "../coinCheckout";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import {
  coinWallets,
  creatorProfiles,
  creatorPayouts,
  communityCharacters,
  girlfriends,
  users,
  mediaDeletions,
} from "../../drizzle/schema";
import {
  protectedProcedure,
  publicProcedure,
  adminProcedure,
  router,
} from "../_core/trpc";
import { getDb, withUserTransaction } from "../database";
import {
  walletInfo,
  claimReferral,
  creatorBalance,
  economyPolicy,
} from "../economy";
import { getTierLimits, isBillingEnforced } from "../billing";
import { createGirlfriend } from "../repositories/companions";
import { storageRead } from "../storage";
import { officialImageMime } from "../characterPresets";
import { putStagedMedia, publishMedia } from "../managedMedia";
import { queueMediaDeletion } from "../mediaCleanup";
const database = async () => {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
};
const publicRows = async (userId?: string, characterId?: string) =>
  (await database())
    .select({
      id: communityCharacters.id,
      creator: creatorProfiles.displayName,
      handle: creatorProfiles.handle,
      snapshot: communityCharacters.snapshot,
      createdAt: communityCharacters.createdAt,
    })
    .from(communityCharacters)
    .innerJoin(
      creatorProfiles,
      eq(creatorProfiles.userId, communityCharacters.userId)
    )
    .where(
      and(
        eq(communityCharacters.status, "published"),
        userId ? eq(communityCharacters.userId, userId) : undefined,
        characterId ? eq(communityCharacters.id, characterId) : undefined
      )
    )
    .orderBy(desc(communityCharacters.createdAt))
    .limit(100);
export const economyRouter = router({
  wallet: protectedProcedure.query(({ ctx }) => walletInfo(ctx.user.id)),
  claimReferral: protectedProcedure
    .input(z.object({ code: z.string().regex(/^[a-f0-9]{20}$/) }).strict())
    .mutation(({ ctx, input }) => claimReferral(ctx.user.id, input.code)),
  checkout: protectedProcedure
    .input(
      z
        .object({
          packId: z.string().max(64),
          clientRequestId: z.string().uuid().optional(),
        })
        .strict()
    )
    .mutation(({ ctx, input }) =>
      createCoinCheckout(
        ctx.user.id,
        input.packId,
        input.clientRequestId ?? crypto.randomUUID()
      )
    ),
  community: publicProcedure
    .input(
      z.object({ selectedId: z.string().uuid().optional() }).strict().optional()
    )
    .query(async ({ input }) => {
      const rows = await publicRows();
      if (input?.selectedId && !rows.some(row => row.id === input.selectedId)) {
        const [selected] = await publicRows(undefined, input.selectedId);
        if (selected) rows.unshift(selected);
      }
      return rows;
    }),
  creatorPage: publicProcedure
    .input(z.object({ handle: z.string().regex(/^[a-z0-9_]{3,32}$/) }).strict())
    .query(async ({ input }) => {
      const [row] = await (
        await database()
      )
        .select({
          userId: creatorProfiles.userId,
          handle: creatorProfiles.handle,
          displayName: creatorProfiles.displayName,
          bio: creatorProfiles.bio,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.handle, input.handle));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      const { userId, ...profile } = row;
      return { profile, characters: await publicRows(userId) };
    }),
  creator: protectedProcedure.query(({ ctx }) =>
    withUserTransaction(ctx.user.id, async tx => {
      const [profile] = await tx
        .select()
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, ctx.user.id));
      const publications = await tx
        .select()
        .from(communityCharacters)
        .where(eq(communityCharacters.userId, ctx.user.id))
        .orderBy(desc(communityCharacters.createdAt));
      const earnings = await creatorBalance(tx, ctx.user.id);
      const policy = await economyPolicy(tx);
      const [user] = await tx
        .select({ verified: users.emailVerified })
        .from(users)
        .where(eq(users.id, ctx.user.id));
      return {
        profile: profile ?? null,
        publications,
        ...earnings,
        policy,
        emailVerified: user.verified,
      };
    })
  ),
  saveProfile: protectedProcedure
    .input(
      z
        .object({
          handle: z.string().regex(/^[a-z0-9_]{3,32}$/),
          displayName: z.string().trim().min(1).max(80),
          bio: z.string().trim().max(500),
        })
        .strict()
    )
    .mutation(({ ctx, input }) =>
      withUserTransaction(ctx.user.id, async tx => {
        const [existing] = await tx
          .select()
          .from(creatorProfiles)
          .where(eq(creatorProfiles.handle, input.handle));
        if (existing && existing.userId !== ctx.user.id)
          throw commerceError("handleTaken", "CONFLICT");
        const [owned] = await tx
          .select()
          .from(creatorProfiles)
          .where(eq(creatorProfiles.userId, ctx.user.id));
        if (owned)
          await tx
            .update(creatorProfiles)
            .set(input)
            .where(eq(creatorProfiles.userId, ctx.user.id));
        else
          await tx
            .insert(creatorProfiles)
            .values({ userId: ctx.user.id, ...input });
        return { success: true };
      })
    ),
  submitCharacter: protectedProcedure
    .input(
      z
        .object({
          girlfriendId: z.number().int().positive(),
          summary: z.string().trim().min(10).max(500),
          scenario: z.string().trim().min(10).max(2000),
          adultAndRightsConfirmed: z.literal(true),
          expectedReviewVersion: z.number().int().positive().optional(),
          clientRequestId: z.string().uuid().optional(),
        })
        .strict()
    )
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      const [source] = await db
        .select()
        .from(girlfriends)
        .where(
          and(
            eq(girlfriends.id, input.girlfriendId),
            eq(girlfriends.userId, ctx.user.id),
            isNull(girlfriends.deletedAt)
          )
        );
      if (!source) throw new TRPCError({ code: "NOT_FOUND" });
      const data = await storageRead(source.referenceImageKey),
        mime = officialImageMime(data),
        key = `community-${crypto.randomUUID()}.${mime.split("/")[1]}`;
      const media = await putStagedMedia(ctx.user.id, key, data, mime);
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify([
            input.summary,
            input.scenario,
            source.name,
            source.personality,
            source.appearance,
            source.interests,
            source.referenceImageKey,
          ])
        )
        .digest("hex");
      try {
        return await withUserTransaction(ctx.user.id, async tx => {
          const [profile] = await tx
            .select()
            .from(creatorProfiles)
            .where(eq(creatorProfiles.userId, ctx.user.id));
          const [current] = await tx
            .select()
            .from(girlfriends)
            .where(
              and(
                eq(girlfriends.id, source.id),
                eq(girlfriends.userId, ctx.user.id),
                isNull(girlfriends.deletedAt)
              )
            )
            .for("update");
          if (!profile) throw commerceError("profileRequired");
          if (
            !current ||
            current.referenceImageKey !== source.referenceImageKey
          )
            throw commerceError("sourceChanged");
          const config = await getPublishedProductConfig(tx);
          if (
            characterFieldsError(
              { ...current, openingScenario: input.scenario },
              config.characters
            )
          )
            throw commerceError("sourceChanged");
          const own = await tx
            .select()
            .from(communityCharacters)
            .where(eq(communityCharacters.userId, ctx.user.id))
            .for("update");
          const prior = own.find(row => row.sourceId === source.id);
          if (!prior && own.length >= 100)
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "PUBLICATION_LIMIT",
            });
          const snapshot = {
            name: current.name,
            summary: input.summary,
            scenario: input.scenario,
            personality: current.personality,
            appearance: current.appearance,
            interests: current.interests ?? "",
            imageUrl: media.url,
            imageKey: key,
            behavior: null,
          };
          if (
            prior &&
            input.clientRequestId &&
            prior.submissionId === input.clientRequestId
          ) {
            if (prior.submissionFingerprint !== fingerprint)
              throw commerceError("sourceChanged", "CONFLICT");
            return { success: true };
          }
          if (
            prior &&
            input.expectedReviewVersion !== undefined &&
            prior.reviewVersion !== input.expectedReviewVersion
          )
            throw commerceError("reviewChanged", "CONFLICT");
          if (prior) {
            if (
              prior.pendingSnapshot &&
              prior.pendingSnapshot.imageKey !== prior.snapshot.imageKey
            )
              await tx
                .insert(mediaDeletions)
                .values({
                  key: prior.pendingSnapshot.imageKey,
                  userId: ctx.user.id,
                })
                .onDuplicateKeyUpdate({ set: { availableAt: new Date() } });
            await tx
              .update(communityCharacters)
              .set({
                pendingSnapshot: snapshot,
                status: prior.status === "published" ? "published" : "pending",
                reviewState: "pending",
                reviewVersion: prior.reviewVersion + 1,
                moderationNote: null,
                submissionId: input.clientRequestId ?? null,
                submissionFingerprint: fingerprint,
              })
              .where(eq(communityCharacters.id, prior.id));
          } else
            await tx.insert(communityCharacters).values({
              id: crypto.randomUUID(),
              userId: ctx.user.id,
              sourceId: current.id,
              snapshot,
              pendingSnapshot: snapshot,
              reviewState: "pending",
              submissionId: input.clientRequestId ?? null,
              submissionFingerprint: fingerprint,
            });
          await publishMedia(tx, ctx.user.id, [key]);
          return { success: true };
        });
      } catch (error) {
        await queueMediaDeletion(ctx.user.id, [key]).catch(() => {});
        throw error;
      }
    }),
  unlistCharacter: protectedProcedure
    .input(z.object({ id: z.string().uuid() }).strict())
    .mutation(({ ctx, input }) =>
      withUserTransaction(ctx.user.id, async tx => {
        const [row] = await tx
          .select()
          .from(communityCharacters)
          .where(
            and(
              eq(communityCharacters.userId, ctx.user.id),
              eq(communityCharacters.id, input.id)
            )
          )
          .for("update");
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        if (
          row.pendingSnapshot &&
          row.pendingSnapshot.imageKey !== row.snapshot.imageKey
        )
          await tx
            .insert(mediaDeletions)
            .values({ key: row.pendingSnapshot.imageKey, userId: ctx.user.id })
            .onDuplicateKeyUpdate({ set: { availableAt: new Date() } });
        await tx
          .update(communityCharacters)
          .set({
            status: "unlisted",
            pendingSnapshot: null,
            reviewState: "approved",
            reviewVersion: row.reviewVersion + 1,
          })
          .where(eq(communityCharacters.id, input.id));
        return { success: true };
      })
    ),
  adoptCharacter: protectedProcedure
    .input(z.object({ id: z.string().uuid() }).strict())
    .mutation(async ({ ctx, input }) => {
      const [published] = await (
        await database()
      )
        .select()
        .from(communityCharacters)
        .where(
          and(
            eq(communityCharacters.id, input.id),
            eq(communityCharacters.status, "published")
          )
        );
      if (!published) throw new TRPCError({ code: "NOT_FOUND" });
      const data = await storageRead(published.snapshot.imageKey),
        mime = officialImageMime(data),
        key = `girlfriend-${ctx.user.id}-${crypto.randomUUID()}.${mime.split("/")[1]}`;
      const media = await putStagedMedia(ctx.user.id, key, data, mime);
      const { limits, configuration } = await getTierLimits(ctx.user.id);
      try {
        const role = await createGirlfriend(
          {
            userId: ctx.user.id,
            communitySourceId: published.id,
            name: published.snapshot.name,
            personality: published.snapshot.personality,
            openingScenario: published.snapshot.scenario,
            appearance: published.snapshot.appearance,
            interests: published.snapshot.interests,
            behavior: published.snapshot.behavior,
            referenceImageKey: key,
            referenceImageUrl: media.url,
          },
          isBillingEnforced(configuration) ? limits.maxGirlfriends : null
        );
        if (role.referenceImageKey !== key)
          await queueMediaDeletion(ctx.user.id, [key]);
        return { id: role.id };
      } catch (error) {
        await queueMediaDeletion(ctx.user.id, [key]);
        throw error;
      }
    }),
  requestPayout: protectedProcedure
    .input(
      z
        .object({
          id: z.string().uuid(),
          amountCents: z.number().int().positive().max(10000000),
        })
        .strict()
    )
    .mutation(({ ctx, input }) =>
      withUserTransaction(ctx.user.id, async tx => {
        const [prior] = await tx
          .select()
          .from(creatorPayouts)
          .where(eq(creatorPayouts.id, input.id));
        if (prior) {
          if (
            prior.userId !== ctx.user.id ||
            prior.amountCents !== input.amountCents
          )
            throw new TRPCError({ code: "CONFLICT" });
          return { id: prior.id };
        }
        const policy = await economyPolicy(tx),
          balance = await creatorBalance(tx, ctx.user.id);
        const [user] = await tx
          .select()
          .from(users)
          .where(eq(users.id, ctx.user.id));
        const [wallet] = await tx
          .select()
          .from(coinWallets)
          .where(eq(coinWallets.userId, ctx.user.id));
        const units = input.amountCents * 10000;
        if (
          !policy.enabled ||
          units > balance.availableUnits ||
          (wallet?.paid ?? 0) < 0
        )
          throw commerceError("payoutUnavailable");
        if (!user.emailVerified) throw commerceError("verifyEmail");
        if (input.amountCents < policy.minimumPayoutCents)
          throw commerceError("payoutMinimum");
        if (balance.payouts.some(row => row.status === "requested"))
          throw commerceError("payoutPending");
        await tx.insert(creatorPayouts).values({
          id: input.id,
          userId: ctx.user.id,
          units,
          amountCents: input.amountCents,
        });
        return { id: input.id };
      })
    ),
  admin: router({
    queue: adminProcedure.query(async () => {
      const db = await database();
      return {
        characters: await db
          .select()
          .from(communityCharacters)
          .where(
            or(
              eq(communityCharacters.reviewState, "pending"),
              eq(communityCharacters.status, "pending")
            )
          )
          .orderBy(communityCharacters.createdAt)
          .limit(100),
        published: await db
          .select()
          .from(communityCharacters)
          .where(eq(communityCharacters.status, "published"))
          .orderBy(desc(communityCharacters.updatedAt))
          .limit(100),
        payoutHistory: await db
          .select()
          .from(creatorPayouts)
          .where(
            or(
              eq(creatorPayouts.status, "paid"),
              eq(creatorPayouts.status, "rejected")
            )
          )
          .orderBy(desc(creatorPayouts.createdAt))
          .limit(50),
        payouts: await db
          .select({
            id: creatorPayouts.id,
            userId: creatorPayouts.userId,
            email: users.email,
            amountCents: creatorPayouts.amountCents,
            status: creatorPayouts.status,
            createdAt: creatorPayouts.createdAt,
          })
          .from(creatorPayouts)
          .innerJoin(users, eq(users.id, creatorPayouts.userId))
          .where(eq(creatorPayouts.status, "requested"))
          .limit(100),
      };
    }),
    moderate: adminProcedure
      .input(
        z
          .object({
            id: z.string().uuid(),
            expectedImageKey: z.string().min(1).max(500),
            expectedReviewVersion: z.number().int().positive().optional(),
            status: z.enum(["published", "rejected", "unlisted"]),
            note: z.string().trim().min(3).max(500),
          })
          .strict()
      )
      .mutation(async ({ input }) => {
        const db = await database();
        const [row] = await db
          .select()
          .from(communityCharacters)
          .where(eq(communityCharacters.id, input.id));
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        return withUserTransaction(row.userId, async tx => {
          const [current] = await tx
            .select()
            .from(communityCharacters)
            .where(eq(communityCharacters.id, input.id))
            .for("update");
          const candidate = current?.pendingSnapshot ?? current?.snapshot;
          if (
            !current ||
            candidate?.imageKey !== input.expectedImageKey ||
            (input.expectedReviewVersion !== undefined &&
              current.reviewVersion !== input.expectedReviewVersion) ||
            (input.status !== "unlisted" &&
              current.reviewState !== "pending" &&
              current.status !== "pending") ||
            (input.status === "unlisted" && current.status !== "published")
          )
            throw commerceError("reviewChanged", "CONFLICT");
          const replacing = input.status === "published";
          if (replacing && current.snapshot.imageKey !== candidate.imageKey)
            await tx
              .insert(mediaDeletions)
              .values({ key: current.snapshot.imageKey, userId: row.userId })
              .onDuplicateKeyUpdate({ set: { availableAt: new Date() } });
          if (
            input.status === "unlisted" &&
            current.pendingSnapshot &&
            current.pendingSnapshot.imageKey !== current.snapshot.imageKey
          )
            await tx
              .insert(mediaDeletions)
              .values({
                key: current.pendingSnapshot.imageKey,
                userId: row.userId,
              })
              .onDuplicateKeyUpdate({ set: { availableAt: new Date() } });
          await tx
            .update(communityCharacters)
            .set({
              snapshot: replacing ? candidate : current.snapshot,
              pendingSnapshot:
                replacing || input.status === "unlisted"
                  ? null
                  : current.pendingSnapshot,
              status:
                input.status === "rejected" && current.status === "published"
                  ? "published"
                  : input.status,
              reviewState:
                input.status === "rejected" ? "rejected" : "approved",
              reviewVersion: current.reviewVersion + 1,
              moderationNote: input.note,
            })
            .where(eq(communityCharacters.id, input.id));
          return { success: true };
        });
      }),
    settlePayout: adminProcedure
      .input(
        z
          .object({
            id: z.string().uuid(),
            status: z.enum(["paid", "rejected"]),
            reference: z.string().trim().max(200),
            note: z.string().trim().min(3).max(500),
          })
          .strict()
      )
      .mutation(async ({ input }) => {
        if (input.status === "paid" && !input.reference)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "EXTERNAL_PAYMENT_REFERENCE_REQUIRED",
          });
        const [row] = await (
          await database()
        )
          .select()
          .from(creatorPayouts)
          .where(eq(creatorPayouts.id, input.id));
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        return withUserTransaction(row.userId, async tx => {
          const balance = await creatorBalance(tx, row.userId);
          const current = balance.payouts.find(item => item.id === row.id)!;
          if (current.status !== "requested") {
            if (
              current.status === input.status &&
              current.reference === input.reference
            )
              return { success: true };
            throw new TRPCError({ code: "CONFLICT" });
          }
          const [wallet] = await tx
            .select()
            .from(coinWallets)
            .where(eq(coinWallets.userId, row.userId));
          if (
            input.status === "paid" &&
            (balance.availableUnits < 0 || (wallet?.paid ?? 0) < 0)
          )
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "EARNINGS_REVERSED",
            });
          await tx
            .update(creatorPayouts)
            .set({
              status: input.status,
              reference: input.reference,
              note: input.note,
            })
            .where(eq(creatorPayouts.id, input.id));
          return { success: true };
        });
      }),
  }),
});
