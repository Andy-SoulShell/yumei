/** 主动联系偏好与记忆共用时区，乐观版本避免多设备覆写。 */
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import {
  companionPreferences,
  girlfriends,
  notifications,
  proactiveContacts,
} from "../drizzle/schema";
import {
  DEFAULT_PROACTIVE_PREFERENCES,
  proactivePreferencesSchema,
  type ProactivePreferences,
} from "../shared/proactiveContact";
import { withUserTransaction } from "./database";
import { invalidateMemoryDerived } from "./memoryDerived";

export async function saveCompanionPreferences(
  userId: string,
  expectedRevision: number,
  preferences: ProactivePreferences
) {
  const parsed = proactivePreferencesSchema.safeParse(preferences);
  if (
    !parsed.success ||
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 0
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid companion preferences",
    });
  return withUserTransaction(userId, async tx => {
    const [stored] = await tx
      .select()
      .from(companionPreferences)
      .where(eq(companionPreferences.userId, userId))
      .for("update");
    const current = stored ?? {
      userId,
      ...DEFAULT_PROACTIVE_PREFERENCES,
      revision: 0,
    };
    if (current.revision !== expectedRevision)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Preferences changed on another device. Refresh and try again.",
      });
    if (
      Object.entries(parsed.data).every(
        ([key, value]) => current[key as keyof ProactivePreferences] === value
      )
    )
      return current;
    const saved = { userId, ...parsed.data, revision: current.revision + 1 };
    await tx
      .insert(companionPreferences)
      .values(saved)
      .onDuplicateKeyUpdate({ set: saved });
    if (current.timeZone !== saved.timeZone) {
      const roles = await tx
        .select({ id: girlfriends.id })
        .from(girlfriends)
        .where(eq(girlfriends.userId, userId))
        .for("update");
      for (const role of roles)
        await invalidateMemoryDerived(tx, userId, role.id);
    }
    const pending = await tx
      .select({ notificationId: proactiveContacts.notificationId })
      .from(proactiveContacts)
      .where(
        and(
          eq(proactiveContacts.userId, userId),
          inArray(proactiveContacts.status, ["pending", "delivering"])
        )
      )
      .for("update");
    await tx
      .update(proactiveContacts)
      .set({ status: "cancelled", leaseToken: null, leaseUntil: null })
      .where(
        and(
          eq(proactiveContacts.userId, userId),
          inArray(proactiveContacts.status, ["pending", "delivering"])
        )
      );
    if (pending.length)
      await tx.delete(notifications).where(
        and(
          eq(notifications.userId, userId),
          inArray(
            notifications.id,
            pending.map(row => row.notificationId)
          )
        )
      );
    return saved;
  });
}
