/** 验证语义检索的向量边界，以及跨时区/夏令时的来源日期锚定。 */
import { describe, expect, it } from "vitest";
import {
  memoryCosineSimilarity,
  memorySourceDay,
  resolveMemoryEventDay,
  validMemoryVector,
} from "../shared/memorySemantics";

describe("memory semantics primitives", () => {
  it("ranks semantic vectors independent of literal word overlap and scale", () => {
    const query = [0.8, 0.6, 0];
    const related = [8, 6, 0],
      unrelated = [0, 0, 1];
    expect(memoryCosineSimilarity(query, related)).toBeCloseTo(1);
    expect(memoryCosineSimilarity(query, unrelated)).toBe(0);
    expect(memoryCosineSimilarity(query, [-8, -6, 0])).toBeCloseTo(-1);
    expect(memoryCosineSimilarity([1e-200], [1e-200])).toBe(1);
  });
  it.each([[], [0, 0], [NaN], [Infinity], ["1"], Array(4097).fill(1), [1e10]])(
    "rejects invalid embedding %#",
    value => {
      expect(validMemoryVector(value)).toBe(false);
      expect(memoryCosineSimilarity(value, [1])).toBeNull();
    }
  );
  it("does not compare models with different dimensions", () => {
    expect(memoryCosineSimilarity([1, 2], [1])).toBeNull();
  });
  it("anchors tomorrow to the original user day rather than extraction time", () => {
    const source = new Date("2026-10-20T23:30:00Z");
    expect(resolveMemoryEventDay("明天要面试", source, "Asia/Shanghai")).toBe(
      "2026-10-22"
    );
    expect(
      resolveMemoryEventDay(
        "tomorrow is my interview",
        source,
        "America/Los_Angeles"
      )
    ).toBe("2026-10-21");
    expect(resolveMemoryEventDay("明日は面接", source, "Asia/Tokyo")).toBe(
      "2026-10-22"
    );
    expect(resolveMemoryEventDay("내일 면접이야", source, "Asia/Seoul")).toBe(
      "2026-10-22"
    );
  });
  it("advances calendar days over DST and validates explicit leap dates", () => {
    expect(
      resolveMemoryEventDay(
        "tomorrow",
        new Date("2026-03-08T06:30:00Z"),
        "America/New_York"
      )
    ).toBe("2026-03-09");
    expect(resolveMemoryEventDay("2028-02-29旅行", new Date(), "UTC")).toBe(
      "2028-02-29"
    );
    expect(
      resolveMemoryEventDay("2026-02-30旅行", new Date(), "UTC")
    ).toBeNull();
    expect(resolveMemoryEventDay("过阵子去旅行", new Date(), "UTC")).toBeNull();
    expect(memorySourceDay(new Date(), "invalid/timezone")).toBeNull();
    expect(
      resolveMemoryEventDay(
        "明年1月3日面试",
        new Date("2026-10-20T10:00:00Z"),
        "UTC"
      )
    ).toBe("2027-01-03");
    expect(
      resolveMemoryEventDay(
        "去年10月20日搬家",
        new Date("2026-10-20T10:00:00Z"),
        "UTC"
      )
    ).toBe("2025-10-20");
  });
});
