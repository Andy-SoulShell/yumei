/** 制造真实 InnoDB 死锁，验证有界重试不会重复提交业务变更。 */
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { users } from "../drizzle/schema";
import { getDb, withUserTransaction } from "./db";
import { createTestUser } from "./testFixtures";

describe("transaction retry", () => {
  it("retries a deadlock victim and commits each logical update exactly once", async () => {
    const first = await createTestUser();
    const second = await createTestUser();
    let arrived = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => {
      release = resolve;
    });
    let attempts = 0;
    const update = (own: string, other: string) => {
      let firstAttempt = true;
      return withUserTransaction(own, async tx => {
        attempts++;
        if (firstAttempt) {
          firstAttempt = false;
          if (++arrived === 2) release();
          await barrier;
        }
        await tx
          .update(users)
          .set({ name: sql`CONCAT(COALESCE(${users.name}, ''), 'x')` })
          .where(eq(users.id, other));
      });
    };
    await Promise.all([update(first, second), update(second, first)]);
    expect(attempts).toBeGreaterThanOrEqual(3);
    const db = (await getDb())!;
    for (const id of [first, second]) {
      const [row] = await db.select().from(users).where(eq(users.id, id));
      expect(row.name).toBe("x");
    }
  });
});
