/** 内置目录的公开资料与实际参考图必须完整，确保新增角色可以直接创建。 */
import { describe, expect, it } from "vitest";
import { CHARACTER_PRESETS } from "../../../../server/seeds/characterPresets";
import { readOfficialImage } from "../../../../server/characterPresets";
import { initialDiscovery } from "../../../../server/seeds/discovery";
const { home } = initialDiscovery();
const HOME_CHARACTER_LIMIT = home.homeCharacterLimit;
const FEATURED_CHARACTERS = home.featuredIds;

describe("bundled character catalogue", () => {
  it("contains enough distinct adult characters for the homepage and ten valid featured picks", () => {
    expect(CHARACTER_PRESETS.length).toBeGreaterThanOrEqual(
      HOME_CHARACTER_LIMIT
    );
    expect(new Set(CHARACTER_PRESETS.map(role => role.id)).size).toBe(
      CHARACTER_PRESETS.length
    );
    expect(new Set(CHARACTER_PRESETS.map(role => role.imageUrl)).size).toBe(
      CHARACTER_PRESETS.length
    );
    expect(FEATURED_CHARACTERS).toHaveLength(10);
    for (const role of CHARACTER_PRESETS) {
      expect(role.age).toBeGreaterThanOrEqual(18);
      expect(role.personality.length).toBeGreaterThan(20);
      expect(role.appearance.length).toBeGreaterThan(20);
    }
  });
  it("loads every bundled portrait as actual JPEG bytes through the server reader", async () => {
    for (const role of CHARACTER_PRESETS) {
      const bytes = (await readOfficialImage(role.imageUrl)).data;
      expect(bytes.byteLength).toBeGreaterThan(1000);
      expect(Array.from(bytes.subarray(0, 3))).toEqual([255, 216, 255]);
    }
  });
});
