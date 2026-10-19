import { describe, it, expect } from "vitest";
import {
  softDeleteGirlfriend,
  softDeleteGirlfriends,
  restoreGirlfriend,
  permanentDeleteGirlfriend,
  getTrashGirlfriends,
  cleanupExpiredTrash,
  getUserGirlfriends,
  getActiveGirlfriend,
  createGirlfriend,
} from "./db";

// Use unique userIds to avoid conflicts with other tests.
// users.id is varchar(255) since the Better-Auth migration (0013).
const TEST_USER_ID = "test-user-99900";
const TEST_USER_ID_2 = "test-user-99901";
const TEST_USER_ID_3 = "test-user-99902";

describe("Soft Delete (Trash)", () => {
  it("should soft delete a girlfriend and hide from list", async () => {
    // Create a girlfriend
    const gf = await createGirlfriend({
      userId: TEST_USER_ID,
      name: "TestTrash",
      personality: "test",
      appearance: "test",
      referenceImageUrl: "https://example.com/test.png",
      referenceImageKey: "test-key",
      isActive: false,
    });

    // Soft delete
    await softDeleteGirlfriend(gf.id, TEST_USER_ID);

    // Should not appear in normal list
    const list = await getUserGirlfriends(TEST_USER_ID);
    const found = list.find((g) => g.id === gf.id);
    expect(found).toBeUndefined();

    // Should appear in trash
    const trash = await getTrashGirlfriends(TEST_USER_ID);
    const inTrash = trash.find((g) => g.id === gf.id);
    expect(inTrash).toBeDefined();
    expect(inTrash!.deletedAt).not.toBeNull();

    // Cleanup
    await permanentDeleteGirlfriend(gf.id, TEST_USER_ID);
  });

  it("should restore a soft-deleted girlfriend", async () => {
    const gf = await createGirlfriend({
      userId: TEST_USER_ID,
      name: "TestRestore",
      personality: "test",
      appearance: "test",
      referenceImageUrl: "https://example.com/test.png",
      referenceImageKey: "test-key",
      isActive: false,
    });

    // Soft delete
    await softDeleteGirlfriend(gf.id, TEST_USER_ID);

    // Restore
    await restoreGirlfriend(gf.id, TEST_USER_ID);

    // Should appear in normal list again
    const list = await getUserGirlfriends(TEST_USER_ID);
    const found = list.find((g) => g.id === gf.id);
    expect(found).toBeDefined();
    expect(found!.deletedAt).toBeNull();

    // Should not appear in trash
    const trash = await getTrashGirlfriends(TEST_USER_ID);
    const inTrash = trash.find((g) => g.id === gf.id);
    expect(inTrash).toBeUndefined();

    // Cleanup
    await permanentDeleteGirlfriend(gf.id, TEST_USER_ID);
  });

  it("should permanently delete a girlfriend and all data", async () => {
    const gf = await createGirlfriend({
      userId: TEST_USER_ID,
      name: "TestPermanent",
      personality: "test",
      appearance: "test",
      referenceImageUrl: "https://example.com/test.png",
      referenceImageKey: "test-key",
      isActive: false,
    });

    await permanentDeleteGirlfriend(gf.id, TEST_USER_ID);

    // Should not appear in any list
    const list = await getUserGirlfriends(TEST_USER_ID);
    expect(list.find((g) => g.id === gf.id)).toBeUndefined();

    const trash = await getTrashGirlfriends(TEST_USER_ID);
    expect(trash.find((g) => g.id === gf.id)).toBeUndefined();
  });

  it("should deactivate girlfriend on soft delete", async () => {
    const gf = await createGirlfriend({
      userId: TEST_USER_ID,
      name: "TestActiveDelete",
      personality: "test",
      appearance: "test",
      referenceImageUrl: "https://example.com/test.png",
      referenceImageKey: "test-key",
      isActive: true,
    });

    await softDeleteGirlfriend(gf.id, TEST_USER_ID);

    // Active girlfriend should be gone
    const active = await getActiveGirlfriend(TEST_USER_ID);
    if (active) {
      expect(active.id).not.toBe(gf.id);
    }

    // Cleanup
    await permanentDeleteGirlfriend(gf.id, TEST_USER_ID);
  });
});

describe("Batch Delete", () => {
  it("should batch soft delete multiple girlfriends", async () => {
    const gf1 = await createGirlfriend({
      userId: TEST_USER_ID_2,
      name: "Batch1",
      personality: "test",
      appearance: "test",
      referenceImageUrl: "https://example.com/test.png",
      referenceImageKey: "test-key-1",
      isActive: false,
    });

    const gf2 = await createGirlfriend({
      userId: TEST_USER_ID_2,
      name: "Batch2",
      personality: "test",
      appearance: "test",
      referenceImageUrl: "https://example.com/test.png",
      referenceImageKey: "test-key-2",
      isActive: false,
    });

    const gf3 = await createGirlfriend({
      userId: TEST_USER_ID_2,
      name: "Batch3",
      personality: "test",
      appearance: "test",
      referenceImageUrl: "https://example.com/test.png",
      referenceImageKey: "test-key-3",
      isActive: false,
    });

    // Batch delete 2 of 3
    await softDeleteGirlfriends([gf1.id, gf2.id], TEST_USER_ID_2);

    // Only gf3 should remain in list
    const list = await getUserGirlfriends(TEST_USER_ID_2);
    const ids = list.map((g) => g.id);
    expect(ids).not.toContain(gf1.id);
    expect(ids).not.toContain(gf2.id);
    expect(ids).toContain(gf3.id);

    // gf1 and gf2 should be in trash
    const trash = await getTrashGirlfriends(TEST_USER_ID_2);
    const trashIds = trash.map((g) => g.id);
    expect(trashIds).toContain(gf1.id);
    expect(trashIds).toContain(gf2.id);

    // Cleanup
    await permanentDeleteGirlfriend(gf1.id, TEST_USER_ID_2);
    await permanentDeleteGirlfriend(gf2.id, TEST_USER_ID_2);
    await permanentDeleteGirlfriend(gf3.id, TEST_USER_ID_2);
  });
});

describe("Cleanup Expired Trash", () => {
  it("should not delete items within 7 days", async () => {
    const gf = await createGirlfriend({
      userId: TEST_USER_ID_3,
      name: "RecentTrash",
      personality: "test",
      appearance: "test",
      referenceImageUrl: "https://example.com/test.png",
      referenceImageKey: "test-key",
      isActive: false,
    });

    // Soft delete (just now, within 7 days)
    await softDeleteGirlfriend(gf.id, TEST_USER_ID_3);

    // Cleanup should not remove it
    const cleaned = await cleanupExpiredTrash(TEST_USER_ID_3);
    expect(cleaned).toBe(0);

    // Should still be in trash
    const trash = await getTrashGirlfriends(TEST_USER_ID_3);
    expect(trash.find((g) => g.id === gf.id)).toBeDefined();

    // Cleanup
    await permanentDeleteGirlfriend(gf.id, TEST_USER_ID_3);
  });
});
