import { describe, it, expect } from "vitest";
import { initialDiscovery } from "../../../../server/seeds/discovery";
import { productFixture } from "../../../../server/testProductConfig";
import {
  characterStatus,
  filterCharacters,
  type CharacterRow,
} from "./managementModel";
import { productPublicationReview } from "./productReview";
import { homepageIssues } from "./HomepageEditor";
const seed = initialDiscovery();
function row(index = 0): CharacterRow {
  return {
    id: seed.characters[index].id,
    data: structuredClone(seed.characters[index]),
    archived: false,
  };
}
describe("content library", () => {
  it("distinguishes unpublished edits, scheduled removal and completed archives", () => {
    const item = row();
    expect(characterStatus(item, seed.characters)).toBe(
      item.data.listed ? "已发布" : "未公开"
    );
    item.data.name = "编辑后的名字";
    expect(characterStatus(item, seed.characters)).toBe("待更新");
    item.archived = true;
    expect(characterStatus(item, seed.characters)).toBe("待下架");
    expect(characterStatus(item, [])).toBe("已归档");
    item.archived = false;
    expect(characterStatus(item, [])).toBe("待发布");
  });
  it("keeps pending archives discoverable and searches names, identities and interests", () => {
    const a = row(),
      b = row(1);
    a.archived = true;
    b.data.name = "测试摄影师";
    b.data.interests = "旅行";
    expect(
      filterCharacters([a, b], seed.characters, "", "all", "order")
    ).toEqual([b]);
    expect(
      filterCharacters([a, b], seed.characters, "", "pending", "order")
    ).toHaveLength(2);
    expect(
      filterCharacters([a, b], seed.characters, "", "archived", "order")
    ).toEqual([a]);
    expect(
      filterCharacters([a, b], seed.characters, " 旅行 ", "all", "order")
    ).toEqual([b]);
  });
  it("sorts recent edits without mutating the original rows", () => {
    const a = { ...row(), updatedAt: "2026-10-20" },
      b = { ...row(1), updatedAt: "2026-10-21" },
      rows = [a, b];
    expect(
      filterCharacters(rows, seed.characters, "", "all", "recent")[0].id
    ).toBe(b.id);
    expect(rows).toEqual([a, b]);
  });
});
describe("publishing all setting drafts", () => {
  it("lists every changed section with readable before and after values", () => {
    const config = structuredClone(productFixture);
    config.site.disclosure["zh-CN"] = "新页脚";
    config.uploads.avatar.maxBytes = 1024;
    const review = productPublicationReview(
      config,
      productFixture,
      seed.characters
    );
    expect(review.groups.map(item => item.id)).toEqual(
      expect.arrayContaining(["site", "uploads"])
    );
    expect(
      review.groups.find(item => item.id === "site")!.fields
    ).toContainEqual(
      expect.objectContaining({
        before: productFixture.site.disclosure["zh-CN"],
        after: "新页脚",
      })
    );
    expect(
      review.groups
        .find(item => item.id === "uploads")!
        .fields.some(item => item.after === "1024")
    ).toBe(true);
  });
  it("blocks settings incompatible with a currently live official role", () => {
    const config = structuredClone(productFixture),
      character = structuredClone(seed.characters[0]);
    character.behavior.userNickname = "称".repeat(40);
    config.characters.limits.nickname = 39;
    expect(
      productPublicationReview(config, productFixture, [character]).errors
    ).toContainEqual(
      expect.stringContaining(`${character.name}：称呼最多 39 字`)
    );
  });
  it("does not publish unchanged content even after object keys are reordered", () => {
    const published = Object.fromEntries(
      Object.entries(productFixture).reverse()
    ) as typeof productFixture;
    expect(
      productPublicationReview(productFixture, published, seed.characters)
    ).toMatchObject({ changed: false, groups: [], errors: [] });
  });
});
describe("homepage content validation", () => {
  it("reports duplicate and invalid featured references with role names", () => {
    const home = structuredClone(seed.home),
      rows = seed.characters.map((_, i) => row(i));
    home.featuredIds.push(home.featuredIds[0]);
    const selected = rows.find(item => item.id === home.featuredIds[0])!;
    selected.archived = true;
    expect(homepageIssues(home, rows)).toContain("精选角色不能重复");
    expect(
      homepageIssues(home, rows).some(error =>
        error.includes(selected.data.name)
      )
    ).toBe(true);
  });
  it("requires a valid default and checks new question copy without discarding other languages", () => {
    const home = structuredClone(seed.home),
      rows = seed.characters.map((_, i) => row(i));
    home.defaultPresetId = "missing";
    home.faqs.push({
      id: "new-question",
      question: { "zh-CN": "" },
      answer: { "zh-CN": "" },
    });
    expect(homepageIssues(home, rows)).toContain("请选择有效的默认角色");
    expect(homepageIssues(home, rows).length).toBeGreaterThan(1);
    expect(home.faqs[0].answer.en).toBe(seed.home.faqs[0].answer.en);
  });
});
