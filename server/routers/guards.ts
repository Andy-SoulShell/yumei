import { TRPCError } from "@trpc/server";
export function ensureAgeConfirmed(user: { birthDate: Date | string | null }) {
  if (!user.birthDate) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "AGE_CONFIRMATION_REQUIRED",
    });
  }
}
export function yearsSince(date: Date): number {
  const now = new Date();
  let years = now.getUTCFullYear() - date.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - date.getUTCMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && now.getUTCDate() < date.getUTCDate())
  ) {
    years -= 1;
  }
  return years;
}
