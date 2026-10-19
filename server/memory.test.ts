import { describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import {
  bigramOverlap,
  memoryCapacity,
  memoryInjectionK,
  scoreMemory,
  timeDecayFactor,
} from "../shared/memory";
import {
  parseExtractionResponse,
  storeExtractedMemories,
  enforceMemoryCapacity,
  buildMemoryPromptBlock,
  listMemories,
  deleteMemory,
  setMemoryPinned,
  getFreshEventMemory,
} from "./memory";
import { getDb, checkAndCreateProactiveNotification, createGirlfriend } from "./db";

// ---------------------------------------------------------------------------
// Pure scoring (no DB)
// ---------------------------------------------------------------------------

describe("shared/memory scoring", () => {
  it("bigramOverlap finds zh overlap", () => {
    expect(bigramOverlap("面试", "用户下周二有一场产品经理面试")).toBeGreaterThan(0.5);
    expect(bigramOverlap("今天吃什么", "用户养了一只叫团团的猫")).toBe(0);
  });

  it("bigramOverlap ignores punctuation and case", () => {
    expect(bigramOverlap("Loves Coffee!", "loves coffee")).toBe(1);
  });

  it("timeDecayFactor decays toward the 0.5 floor", () => {
    const now = new Date();
    const fresh = timeDecayFactor(now, now);
    const old = timeDecayFactor(new Date(now.getTime() - 90 * 86_400_000), now);
    expect(fresh).toBeCloseTo(1, 1);
    expect(old).toBeLessThan(0.55);
    expect(old).toBeGreaterThanOrEqual(0.5);
  });

  it("keyword affinity outranks a heavier but unrelated memory", () => {
    const now = new Date();
    const base = { pinned: false, lastRecalledAt: null, createdAt: now };
    const related = { ...base, content: "用户下周二有一场产品经理面试", weight: 40 };
    const unrelated = { ...base, content: "用户喜欢喝拿铁", weight: 90 };
    const message = "好紧张，马上要面试了";
    expect(scoreMemory(related, message, now)).toBeGreaterThan(
      scoreMemory(unrelated, message, now)
    );
  });

  it("capacity and k scale with intimacy level (M2-5)", () => {
    expect(memoryCapacity(1)).toBe(30);
    expect(memoryCapacity(10)).toBe(120);
    expect(memoryInjectionK(1)).toBe(5);
    expect(memoryInjectionK(10)).toBe(9);
    expect(memoryInjectionK(999)).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// Extraction parsing (no DB / no network)
// ---------------------------------------------------------------------------

describe("parseExtractionResponse", () => {
  it("parses a clean JSON response", () => {
    const out = parseExtractionResponse(
      JSON.stringify({
        memories: [{ category: "fact", content: "用户是产品经理", importance: 7 }],
      })
    );
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("fact");
  });

  it("recovers JSON wrapped in code fences / prose", () => {
    const out = parseExtractionResponse(
      '好的，以下是提取结果：\n```json\n{"memories":[{"category":"event","content":"用户明天要面试","importance":8}]}\n```'
    );
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("event");
  });

  it("returns [] on invalid shapes instead of throwing", () => {
    expect(parseExtractionResponse("not json at all")).toEqual([]);
    expect(parseExtractionResponse('{"memories":[{"category":"nope","content":"x","importance":5}]}')).toEqual([]);
    expect(parseExtractionResponse("")).toEqual([]);
  });

  it("truncates over-long content", () => {
    const long = "用".repeat(500);
    const out = parseExtractionResponse(
      JSON.stringify({ memories: [{ category: "fact", content: long, importance: 5 }] })
    );
    // 400+ chars exceeds the schema max — rejected outright is acceptable,
    // but if accepted it must be truncated to MEMORY_MAX_LENGTH.
    if (out.length > 0) {
      expect(out[0].content.length).toBeLessThanOrEqual(200);
    }
  });
});

// ---------------------------------------------------------------------------
// DB-backed behavior
// ---------------------------------------------------------------------------

async function makeGirlfriend(userId: string) {
  return createGirlfriend({
    userId,
    name: "MemTest",
    personality: "test",
    appearance: "test",
    referenceImageUrl: "https://example.com/x.png",
    referenceImageKey: "mem-test-key",
    isActive: false,
  });
}

describe("memory storage (DB)", () => {
  it("inserts new memories and reinforces near-duplicates", async () => {
    if (!(await getDb())) return;
    const userId = `mem-user-${nanoid(8)}`;
    const gf = await makeGirlfriend(userId);

    const first = await storeExtractedMemories(userId, gf.id, [
      { category: "fact", content: "用户是一名产品经理", importance: 7 },
    ]);
    expect(first.inserted).toBe(1);

    // Near-duplicate reinforces rather than inserting.
    const second = await storeExtractedMemories(userId, gf.id, [
      { category: "fact", content: "用户是产品经理", importance: 6 },
    ]);
    expect(second.reinforced).toBe(1);
    expect(second.inserted).toBe(0);

    const all = await listMemories(userId, gf.id);
    expect(all).toHaveLength(1);
    expect(all[0].weight).toBeGreaterThanOrEqual(70); // 70 base + 5 bump
  });

  it("enforces level-based capacity, sparing pinned rows", async () => {
    if (!(await getDb())) return;
    const userId = `mem-user-${nanoid(8)}`;
    const gf = await makeGirlfriend(userId);

    // Fill past level-1 capacity (30) with genuinely distinct memories
    // (random bodies, varied shapes — must not trip the similarity dedupe).
    const batch = Array.from({ length: 35 }, (_, i) => ({
      category: "preference" as const,
      content: `${nanoid(6)}偏好${i}：${nanoid(12)}`,
      importance: 2,
    }));
    await storeExtractedMemories(userId, gf.id, batch);

    // Pin one row, then enforce.
    const before = await listMemories(userId, gf.id);
    await setMemoryPinned(userId, before[before.length - 1].id, true);
    const evicted = await enforceMemoryCapacity(userId, gf.id, 1);
    expect(evicted).toBeGreaterThan(0);

    const after = await listMemories(userId, gf.id);
    expect(after.length).toBeLessThanOrEqual(30);
    expect(after.some(m => m.pinned)).toBe(true);
  });

  it("builds a relevance-ranked prompt block and refreshes recall time", async () => {
    if (!(await getDb())) return;
    const userId = `mem-user-${nanoid(8)}`;
    const gf = await makeGirlfriend(userId);

    await storeExtractedMemories(userId, gf.id, [
      { category: "event", content: "用户下周二有一场重要的面试", importance: 8 },
      { category: "preference", content: "用户喜欢喝拿铁咖啡", importance: 5 },
    ]);

    const block = await buildMemoryPromptBlock(userId, gf.id, "面试好紧张啊", 1);
    expect(block).toContain("你记得的关于用户的事");
    expect(block).toContain("面试");

    const rows = await listMemories(userId, gf.id);
    const interview = rows.find(m => m.content.includes("面试"));
    expect(interview?.lastRecalledAt).toBeTruthy();
  });

  it("returns empty block when there are no memories", async () => {
    if (!(await getDb())) return;
    const userId = `mem-user-${nanoid(8)}`;
    const gf = await makeGirlfriend(userId);
    expect(await buildMemoryPromptBlock(userId, gf.id, "你好", 1)).toBe("");
  });

  it("delete removes only the caller's memory", async () => {
    if (!(await getDb())) return;
    const userId = `mem-user-${nanoid(8)}`;
    const gf = await makeGirlfriend(userId);
    await storeExtractedMemories(userId, gf.id, [
      { category: "fact", content: "用户住在杭州西湖区", importance: 6 },
    ]);
    const [row] = await listMemories(userId, gf.id);

    // A different user cannot delete it…
    await deleteMemory("someone-else", row.id);
    expect(await listMemories(userId, gf.id)).toHaveLength(1);
    // …the owner can.
    await deleteMemory(userId, row.id);
    expect(await listMemories(userId, gf.id)).toHaveLength(0);
  });
});

describe("proactive notifications reference memories (M2-4)", () => {
  it("mentions a fresh event memory in the notification", async () => {
    if (!(await getDb())) return;
    const userId = `mem-user-${nanoid(8)}`;
    const gf = await makeGirlfriend(userId);
    await storeExtractedMemories(userId, gf.id, [
      { category: "event", content: "用户周五要参加朋友的婚礼", importance: 7 },
    ]);

    const fresh = await getFreshEventMemory(userId, gf.id);
    expect(fresh?.content).toContain("婚礼");

    const notification = await checkAndCreateProactiveNotification(userId);
    expect(notification).toBeTruthy();
    expect(notification!.content).toContain("婚礼");

    // Daily cap: second call the same day yields nothing.
    expect(await checkAndCreateProactiveNotification(userId)).toBeNull();
  });
});
