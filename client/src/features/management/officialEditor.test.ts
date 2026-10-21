import { describe, expect, it } from "vitest";
import { initialDiscovery } from "../../../../server/seeds/discovery";
import { productFixture } from "../../../../server/testProductConfig";
import {
  createOfficialCharacter,
  prepareOfficialCharacter,
  officialCharacterIssues,
  discoveryPublicationReview,
} from "./officialEditor";

const rules = productFixture.characters;
function draft() {
  const published = initialDiscovery();
  return {
    published,
    home: structuredClone(published.home),
    characters: published.characters.map(data => ({
      data: structuredClone(data),
      archived: false,
    })),
  };
}
describe("official character editing", () => {
  it("starts with a clean identity and accepts two required fields with visible defaults", () => {
    const source = initialDiscovery().characters[0];
    const value = createOfficialCharacter(source, rules, 30);
    expect(value.id).not.toBe(source.id);
    expect(value.name).toBe("");
    expect(value.personality).toBe("");
    expect(value.label.en).toBeUndefined();
    expect(value.behavior).toEqual(rules.defaultBehavior);
    const candidate = prepareOfficialCharacter({
      ...value,
      name: "新的伙伴",
      personality: "温暖，喜欢摄影，认真倾听。",
    });
    expect(candidate.label["zh-CN"]).toBe("AI 伙伴");
    expect(candidate.tagline["zh-CN"]).toBe(candidate.personality);
    expect(candidate.appearance).toContain("参考图片");
    expect(officialCharacterIssues(candidate, rules)).toEqual({});
  });
  it("reports current dynamic field limits before save and clears errors on correction", () => {
    const character = initialDiscovery().characters[0];
    const value = {
      ...character,
      age: 17,
      name: "名".repeat(rules.limits.name + 1),
      behavior: {
        ...character.behavior,
        userNickname: "称".repeat(rules.limits.nickname + 1),
      },
    };
    expect(officialCharacterIssues(value, rules)).toMatchObject({
      age: expect.stringContaining("18"),
      name: expect.stringContaining("最多"),
      "behavior.userNickname": expect.stringContaining(
        String(rules.limits.nickname)
      ),
    });
    value.age = 18;
    value.name = "合法名字";
    value.behavior.userNickname = "称".repeat(rules.limits.nickname);
    expect(officialCharacterIssues(value, rules)).toEqual({});
  });
  it("keeps existing localized copy and behavior intact when using optional defaults", () => {
    const source = initialDiscovery().characters[0];
    expect(prepareOfficialCharacter(source)).toEqual(source);
    const blank = {
      ...source,
      label: { "zh-CN": "", en: "Existing translation" },
      tagline: { "zh-CN": "" },
      appearance: "",
    };
    expect(prepareOfficialCharacter(blank).label.en).toBe(
      "Existing translation"
    );
    expect(source.appearance).not.toBe("");
  });
});
describe("official publication review", () => {
  it("shows only the edited FAQ field instead of all unchanged multilingual questions", () => {
    const state = draft();
    state.home.faqs[0].answer["zh-CN"] = "新的中文答案";
    const review = discoveryPublicationReview(state, rules);
    expect(review.home).toHaveLength(1);
    expect(review.home[0]).toMatchObject({
      field: expect.stringContaining("回答 · 简体中文"),
      before: state.published.home.faqs[0].answer["zh-CN"],
      after: "新的中文答案",
    });
    expect(review.home[0].before).not.toContain(
      state.published.home.faqs[1].question["zh-CN"]
    );
  });
  it("reports carousel ordering and added or removed entries separately by stable ID", () => {
    const state = draft(),
      original = structuredClone(state.home.slides);
    state.home.slides = [
      original[1],
      original[0],
      { ...original[2], id: "new-slide" },
    ];
    const fields = discoveryPublicationReview(state, rules).home.map(
      item => item.field
    );
    expect(fields).toContain("轮播 · 展示顺序");
    expect(fields.some(field => field.includes("新增"))).toBe(true);
    expect(fields.some(field => field.includes("移除"))).toBe(true);
  });
  it("includes all changed roles, archives and homepage drafts with before/after values", () => {
    const state = draft();
    state.characters[0].data.name = "新的名字";
    state.characters[1].archived = true;
    const added = {
      ...structuredClone(state.characters[2].data),
      id: "new-character",
      name: "新增角色",
    };
    state.characters.push({ data: added, archived: false });
    state.home.pageSize++;
    const review = discoveryPublicationReview(state, rules);
    expect(review.items.map(item => item.kind)).toEqual(
      expect.arrayContaining(["新增", "修改", "下架"])
    );
    expect(
      review.items.find(item => item.id === state.characters[0].data.id)?.fields
    ).toContainEqual({
      field: "名字",
      before: state.published.characters[0].name,
      after: "新的名字",
    });
    expect(review.home).toContainEqual({
      field: "每页数量",
      before: `${state.published.home.pageSize} 项`,
      after: `${state.home.pageSize} 项`,
    });
    expect(review.changed).toBe(true);
  });
  it("blocks invalid homepage references and roles incompatible with live rules", () => {
    const state = draft();
    state.characters.find(
      item => item.data.id === state.home.defaultPresetId
    )!.archived = true;
    state.characters[1].data.behavior.userNickname = "称".repeat(
      rules.limits.nickname + 1
    );
    const review = discoveryPublicationReview(state, rules);
    expect(review.errors).toContain(
      "首页默认角色已归档，请先在首页设置更换默认角色。"
    );
    expect(review.errors.some(error => error.includes("称呼最多"))).toBe(true);
  });
  it("does not invent changes from JSON key order or restored identical content", () => {
    const state = draft();
    state.characters[0].data = Object.fromEntries(
      Object.entries(state.characters[0].data).reverse()
    ) as (typeof state.characters)[0]["data"];
    expect(discoveryPublicationReview(state, rules)).toMatchObject({
      changed: false,
      items: [],
      home: [],
      errors: [],
    });
  });
});
