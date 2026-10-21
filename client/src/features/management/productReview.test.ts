import { expect, it } from "vitest";
import { productFixture } from "../../../../server/testProductConfig";
import { productPublicationReview } from "./productReview";
it("includes actual units, currency and local clocks in publication changes", () => {
  const value = structuredClone(productFixture);
  value.uploads.avatar.maxBytes = 2097152;
  value.runtime.chat.replyTimeoutMs = 123000;
  value.runtime.chat.topP = 0.75;
  value.proactive.defaults.quietStart = 1234;
  value.billing.plans[1].price.currency = "CNY";
  value.billing.plans[1].price.amount = 88;
  const fields = productPublicationReview(
    value,
    productFixture,
    []
  ).groups.flatMap(item => item.fields);
  expect(fields.some(item => item.after === "2 MiB")).toBe(true);
  expect(fields.some(item => item.after === "123 秒")).toBe(true);
  expect(fields.some(item => item.after === "75 %")).toBe(true);
  expect(fields.some(item => item.after === "20:34（本地时间）")).toBe(true);
  expect(fields.some(item => item.after === "88 CNY")).toBe(true);
});
it("distinguishes inactive quota periods from unlimited and preserves literal copy", () => {
  const value = structuredClone(productFixture);
  value.billing.plans[0].limits.dailySelfies = null;
  value.billing.plans[0].limits.monthlySelfies = 5;
  value.site.disclosure.en = "direct";
  const review = productPublicationReview(value, productFixture, []);
  expect(review.groups.find(item => item.id === "billing")!.fields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ before: "1 张 / 天", after: "按月计量" }),
      expect.objectContaining({ before: "按日计量", after: "5 张 / 月" }),
    ])
  );
  expect(
    review.groups
      .find(item => item.id === "site")!
      .fields.some(item => item.after === "direct")
  ).toBe(true);
});
it("compares reordered plans by stable identity and shows only order plus genuine edits", () => {
  const value = structuredClone(productFixture);
  [value.billing.plans[0], value.billing.plans[1]] = [
    value.billing.plans[1],
    value.billing.plans[0],
  ];
  value.billing.plans[0].price.amount = 15;
  const fields = productPublicationReview(
    value,
    productFixture,
    []
  ).groups.find(item => item.id === "billing")!.fields;
  expect(fields).toHaveLength(2);
  expect(fields.some(item => item.field.endsWith("顺序"))).toBe(true);
  expect(fields).toContainEqual(
    expect.objectContaining({
      field: expect.stringContaining("Plus"),
      before: "9.99 USD",
      after: "15 USD",
    })
  );
});
it("names the shared notification title and scene body in publication review", () => {
  const value = structuredClone(productFixture);
  value.proactive.templates["notifications:title.thinkingOfYou"]["zh-CN"] =
    "{{name}} · 惦记着你";
  value.proactive.templates["notifications:eventUpcoming"]["zh-CN"] =
    "明天记得：{{memory}}";
  value.memory.levelRules[2].capacity = 78;
  const fields = productPublicationReview(
    value,
    productFixture,
    []
  ).groups.find(item => item.id === "proactive")!.fields;
  expect(fields).toHaveLength(2);
  expect(fields.map(item => item.field)).toEqual(
    expect.arrayContaining([
      expect.stringContaining("普通联系标题（场景共用）"),
      expect.stringContaining("事件即将到来正文"),
    ])
  );
  expect(fields.every(item => !item.field.includes("notifications:"))).toBe(
    true
  );
  expect(
    productPublicationReview(value, productFixture, []).groups.find(
      item => item.id === "memory"
    )!.fields[0].field
  ).toContain("第 3 级起");
});
