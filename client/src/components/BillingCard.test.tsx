// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { productFixture } from "../../../server/testProductConfig";
import { BillingCard } from "./BillingCard";
const mock = vi.hoisted(() => ({
  info: {} as any,
  portal: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: i18n.getFixedT("zh-CN") as Translator,
    locale: "zh-CN",
  }),
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "subscriber" } }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    billing: {
      getInfo: { useQuery: () => ({ data: mock.info }) },
      portal: { useMutation: () => ({ mutate: mock.portal }) },
      refresh: { useMutation: () => ({ mutate: mock.refresh }) },
    },
    useUtils: () => ({ billing: { getInfo: { invalidate: vi.fn() } } }),
  },
}));
let root: Root, node: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  const plans = structuredClone(productFixture.billing.plans);
  plans
    .filter(p => p.id !== "free")
    .forEach(p => (p.checkoutUrl = `https://checkout.example.test/${p.id}`));
  mock.info = {
    mode: "lemonsqueezy",
    plans,
    tier: "plus",
    defaultTierId: "free",
    management: { available: true, checkoutBlocked: true },
    subscription: {
      plan: "plus",
      status: "active",
      renewsAt: new Date("2026-11-01T00:00:00Z"),
    },
    byok: {},
    usage: {},
  };
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
});
afterEach(() => {
  act(() => root.unmount());
  node.remove();
});
it("routes existing subscribers through management rather than opening another checkout", () => {
  act(() => root.render(<BillingCard />));
  expect(node.textContent).toContain("下次扣费日期");
  expect(node.textContent).toContain("实际税费、折扣");
  expect(node.textContent).not.toContain("升级 Pro");
  act(() =>
    Array.from(node.querySelectorAll("button"))
      .find(b => b.textContent === "管理订阅／取消续费")!
      .click()
  );
  expect(mock.portal).toHaveBeenCalledWith({ action: "manage" });
});
it("shows payment recovery and the subscribed plan price when effective access is free", () => {
  mock.info.tier = "free";
  mock.info.subscription.status = "unpaid";
  mock.info.management.available = false;
  act(() => root.render(<BillingCard />));
  expect(node.textContent).toContain("付款状态需要处理");
  expect(node.textContent).toContain("9.99");
  expect(node.textContent).toContain("付款收据");
  expect(node.querySelector('a[href="/help?category=billing"]')).not.toBeNull();
  expect(node.textContent).not.toContain("升级 Plus");
});
it("allows checkout only without an existing live subscription and offers an access check", () => {
  mock.info.tier = "free";
  mock.info.subscription = null;
  mock.info.management = { available: false, checkoutBlocked: false };
  act(() => root.render(<BillingCard />));
  expect(node.textContent).toContain("升级 Plus");
  act(() =>
    Array.from(node.querySelectorAll("button"))
      .find(b => b.textContent === "已付款？核对权益")!
      .click()
  );
  expect(mock.refresh).toHaveBeenCalledOnce();
});
