import { stubProductConfig } from "./testProductConfig";
/** 官方内容发布、权限、并发与稳定来源 ID 的真实数据库回归。 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  discoveryContent,
  girlfriends,
  officialCharacters,
} from "../drizzle/schema";
import { localizeDiscovery, type OfficialCharacter } from "../shared/discovery";
import { getDb } from "./database";
import { readOfficialImage } from "./characterPresets";
import { appRouter } from "./routers";
import { createTestUser } from "./testFixtures";
import { initialDiscovery } from "./seeds/discovery";
import {
  getDiscoveryDraft,
  initializeDiscovery,
} from "./repositories/discovery";

const seed = initialDiscovery();
const ids: string[] = [];
const userIds: string[] = [];
let admin: ReturnType<typeof appRouter.createCaller>;
const guest = appRouter.createCaller({ user: null, req: {}, res: {} } as never);
const character: OfficialCharacter = {
  ...seed.characters[0],
  id: `dynamic-${crypto.randomUUID()}`,
  name: "API 新角色",
  label: { "zh-CN": "动态标签", en: "Dynamic label" },
  tagline: { "zh-CN": "来自管理 API 的问候" },
  sortOrder: 100,
};
ids.push(character.id);

async function caller(role: "admin" | "user" = "user") {
  const id = await createTestUser(`discovery-${crypto.randomUUID()}`);
  userIds.push(id);
  return appRouter.createCaller({
    user: { id, role, birthDate: new Date("1990-01-01") },
    administrator: role === "admin" ? { id: "management" } : null,
    req: {},
    res: {},
  } as never);
}
async function saveHome(home = seed.home) {
  const draft = await getDiscoveryDraft();
  return admin.discovery.admin.saveHomepage({
    expectedRevision: draft.revision,
    home,
  });
}
async function publish() {
  const draft = await getDiscoveryDraft();
  return admin.discovery.admin.publish({ expectedRevision: draft.revision });
}
async function saveRole(value = character) {
  const draft = await getDiscoveryDraft();
  return admin.discovery.admin.saveCharacter({
    expectedRevision: draft.revision,
    character: value,
  });
}

beforeAll(async () => {
  admin = await caller("admin");
  await initializeDiscovery();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  const db = (await getDb())!;
  await db
    .delete(officialCharacters)
    .where(inArray(officialCharacters.id, ids));
  await saveHome();
  await publish();
  await db.delete(girlfriends).where(inArray(girlfriends.userId, userIds));
});

describe("dynamic official content", () => {
  it("seeds all current content once and exposes only a published snapshot to guests", async () => {
    await Promise.all([initializeDiscovery(), initializeDiscovery()]);
    const data = await guest.discovery.get();
    expect(data.characters.filter(item => item.listed)).toHaveLength(20);
    expect(data.home.featuredIds).toEqual(seed.home.featuredIds);
    expect(data.home.slides).toHaveLength(3);
    expect(data.home.faqs).toHaveLength(5);
    for (const locale of ["zh-CN", "en", "ja", "ko"] as const) {
      const localized = localizeDiscovery(data, locale);
      expect(localized.home.slides[0].title).toBeTruthy();
      expect(localized.home.faqs[0].answer).toBe(
        seed.home.faqs[0].answer[locale]
      );
    }
    expect(data).not.toHaveProperty("draft");
    expect(data).not.toHaveProperty("updatedBy");
  });

  it("denies every administration operation to guests and ordinary users", async () => {
    const user = await caller();
    for (const denied of [guest, user]) {
      await expect(denied.discovery.admin.getDraft()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        denied.discovery.admin.saveCharacter({ expectedRevision: 1, character })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        denied.discovery.admin.saveHomepage({
          expectedRevision: 1,
          home: seed.home,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        denied.discovery.admin.archiveCharacter({
          expectedRevision: 1,
          id: character.id,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        denied.discovery.admin.publish({ expectedRevision: 1 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        denied.discovery.admin.uploadImage({ imageBase64: "aW1hZ2U=" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("publishes new IDs and localized homepage data together, without resetting saved edits on initialization", async () => {
    const previous = await guest.discovery.get();
    await saveRole();
    await saveHome({
      ...seed.home,
      featuredIds: [character.id],
      pageSize: 2,
      homeCharacterLimit: 3,
      slides: [
        {
          ...seed.home.slides[0],
          id: "new-banner",
          title: { "zh-CN": "新轮播" },
        },
      ],
      faqs: [
        {
          id: "new-question",
          question: { "zh-CN": "动态问题？" },
          answer: { "zh-CN": "动态回答" },
        },
      ],
    });
    await initializeDiscovery();
    expect(await guest.discovery.get()).toEqual(previous);
    // 发布确认必须拿到与草稿一起读取的旧快照，不能把草稿误当成已发布值。
    const review = await admin.discovery.admin.getDraft();
    expect(review.published.home).toEqual(previous.home);
    expect(review.published.characters).toEqual(previous.characters);
    expect(review.home.pageSize).toBe(2);
    expect(review.characters.some(item => item.id === character.id)).toBe(true);
    expect(
      review.published.characters.some(item => item.id === character.id)
    ).toBe(false);
    await publish();
    const data = await guest.discovery.get();
    expect(
      (await admin.discovery.admin.getDraft()).published.characters
    ).toEqual(data.characters);
    expect(data.home.featuredIds).toEqual([character.id]);
    expect(data.home.pageSize).toBe(2);
    expect(
      localizeDiscovery(data, "en").characters.find(
        item => item.id === character.id
      )?.label
    ).toBe("Dynamic label");
    expect(localizeDiscovery(data, "ja").home.faqs[0].answer).toBe("动态回答");
  });

  it("serializes simultaneous draft saves and rejects stale revisions", async () => {
    const draft = await getDiscoveryDraft();
    const results = await Promise.allSettled(
      [2, 3].map(pageSize =>
        admin.discovery.admin.saveHomepage({
          expectedRevision: draft.revision,
          home: { ...draft.home, pageSize },
        })
      )
    );
    expect(results.filter(item => item.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      item => item.status === "rejected"
    ) as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "CONFLICT" });
    expect((await getDiscoveryDraft()).revision).toBe(draft.revision + 1);
  });

  it("keeps the last publication intact when references fail validation", async () => {
    const previous = await guest.discovery.get();
    await saveHome({ ...seed.home, featuredIds: ["missing-character"] });
    const draft = await getDiscoveryDraft();
    await expect(publish()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await getDiscoveryDraft()).revision).toBe(draft.revision);
    expect(await guest.discovery.get()).toEqual(previous);
    await saveHome({ ...seed.home, featuredIds: [character.id] });
    await publish();
  });

  it("uses canonical published profiles and preserves customized user roles across official edits", async () => {
    const user = await caller();
    stubProductConfig("billing.mode", "none");
    const role = await user.girlfriend.createFromPreset({
      presetId: character.id,
    });
    expect(role).toMatchObject({
      officialPresetId: character.id,
      name: character.name,
      behavior: character.behavior,
    });
    await user.girlfriend.update({
      id: role.id,
      name: "用户自己的名字",
      personality: "用户自己的设定",
    });
    await saveRole({
      ...character,
      name: "官方新名称",
      personality: "官方已更新的人设",
    });
    await publish();
    stubProductConfig("billing.mode", "free");
    const reused = await user.girlfriend.createFromPreset({
      presetId: character.id,
    });
    expect(reused.id).toBe(role.id);
    expect(reused.name).toBe("用户自己的名字");
    expect(reused.personality).toBe("用户自己的设定");
    expect(reused.officialPresetId).toBe(character.id);
    vi.unstubAllEnvs();
  });

  it("deduplicates concurrent official creation before checking the one-character plan limit", async () => {
    const user = await caller();
    stubProductConfig("billing.mode", "free");
    const roles = await Promise.all(
      [1, 2].map(() =>
        user.girlfriend.createFromPreset({ presetId: character.id })
      )
    );
    expect(roles[0].id).toBe(roles[1].id);
    expect(await user.girlfriend.list()).toHaveLength(1);
    vi.unstubAllEnvs();
  });

  it("keeps the source ID when creating a customized preset with a replacement reference", async () => {
    const user = await caller();
    const image = await readOfficialImage(character.imageUrl);
    const role = await user.girlfriend.create({
      presetId: character.id,
      name: "定制角色",
      personality: "定制性格",
      appearance: "定制外貌",
      referenceImageBase64: image.data.toString("base64"),
      referenceImageMimeType: "image/jpeg",
    });
    expect(role.officialPresetId).toBe(character.id);
    expect(role.personality).toBe("定制性格");
  });

  it("archives on publication while retaining existing user associations", async () => {
    const draft = await getDiscoveryDraft();
    await admin.discovery.admin.archiveCharacter({
      expectedRevision: draft.revision,
      id: character.id,
    });
    expect(
      (await guest.discovery.get()).characters.some(
        item => item.id === character.id
      )
    ).toBe(true);
    await expect(publish()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await saveHome();
    await publish();
    expect(
      (await guest.discovery.get()).characters.some(
        item => item.id === character.id
      )
    ).toBe(false);
    const user = await caller();
    await expect(
      user.girlfriend.createFromPreset({ presetId: character.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const rows = await (await getDb())!
      .select()
      .from(girlfriends)
      .where(eq(girlfriends.officialPresetId, character.id));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(item => item.officialPresetId === character.id)).toBe(
      true
    );
  });

  it("supports uploaded official portraits and rejects invalid image bytes and unsafe paths", async () => {
    const image = await readOfficialImage(character.imageUrl);
    const uploaded = await admin.discovery.admin.uploadImage({
      imageBase64: image.data.toString("base64"),
    });
    expect(uploaded.imageUrl).toMatch(/^\/files\/official-/);
    expect((await readOfficialImage(uploaded.imageUrl)).data).toEqual(
      image.data
    );
    await saveRole({ ...character, imageUrl: uploaded.imageUrl });
    await publish();
    const user = await caller();
    expect(
      (await user.girlfriend.createFromPreset({ presetId: character.id }))
        .officialPresetId
    ).toBe(character.id);
    // 收紧新上传规则后，旧上传素材仍能编辑、发布并被新用户使用。
    stubProductConfig("uploads.official", {
      maxBytes: 1024,
      mimeTypes: ["image/png"],
    });
    await saveRole({
      ...character,
      imageUrl: uploaded.imageUrl,
      behavior: { ...character.behavior, userNickname: "称".repeat(40) },
    });
    await publish();
    const freshUser = await caller();
    const freshRole = await freshUser.girlfriend.createFromPreset({
      presetId: character.id,
    });
    expect(freshRole.behavior?.userNickname).toHaveLength(40);
    await expect(
      admin.discovery.admin.uploadImage({
        imageBase64: image.data.toString("base64"),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      admin.discovery.admin.uploadImage({ imageBase64: "aW1hZ2U=" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const draft = await getDiscoveryDraft();
    for (const imageUrl of [
      "/characters/../../.env",
      "https://example.test/image.jpg",
      "/files/private-image.jpg",
    ]) {
      await expect(
        admin.discovery.admin.saveCharacter({
          expectedRevision: draft.revision,
          character: { ...character, imageUrl },
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    for (const href of [
      "//evil.test",
      "javascript:alert(1)",
      "/%2fevil.test",
      "/%5cevil.test",
    ]) {
      await expect(
        admin.discovery.admin.saveHomepage({
          expectedRevision: draft.revision,
          home: { ...seed.home, slides: [{ ...seed.home.slides[0], href }] },
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect((await getDiscoveryDraft()).revision).toBe(draft.revision);
    expect(await (await getDb())!.select().from(discoveryContent)).toHaveLength(
      1
    );
  });
});
