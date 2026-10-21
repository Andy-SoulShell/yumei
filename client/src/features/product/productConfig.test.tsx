// @vitest-environment jsdom
/** 真实查询 Hook 与展示组件必须随发布快照变化，不能依赖内置 ID 或数值。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { translate } from "@shared/i18n";
import type { Locale } from "@shared/locales";
import { productFixture } from "../../../../server/testProductConfig";
import { SelfiePoseDialog } from "@/components/SelfiePoseDialog";
import { IntimacyPanel } from "@/components/IntimacyPanel";
import { BillingCard } from "@/components/BillingCard";
import { useProductConfig } from "./useProductConfig";
import { BehaviorSettings } from "@/features/settings/BehaviorSettings";
import { CharacterPrompt } from "@/features/setup/CharacterPrompt";
import { buildChatSystemPrompt } from "@shared/chatPrompt";

const mock = vi.hoisted(() => ({
  data: undefined as any,
  error: null as Error | null,
  billing: undefined as any,
  locale: "zh-CN" as Locale,
  refetch: vi.fn(),
  options: {} as any,
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    locale: mock.locale,
    t: (key: any, values: any) => translate(key, mock.locale, values),
  }),
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "ui-user" } }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    productConfig: {
      get: {
        useQuery: (_input: unknown, options: unknown) => {
          mock.options = options;
          return { data: mock.data, error: mock.error, refetch: mock.refetch };
        },
      },
    },
    billing: { getInfo: { useQuery: () => ({ data: mock.billing }) } },
  },
}));
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  mock.data = structuredClone(productFixture);
  mock.error = null;
  mock.locale = "zh-CN";
  mock.refetch.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

it("applies the exact API template text and uses the published renderer for the combined preview", async () => {
  const apply = vi.fn();
  mock.data.prompts.quickTemplates = [
    {
      id: "api-template",
      enabled: true,
      label: { "zh-CN": "API 模板按钮" },
      text: { "zh-CN": "这是实际使用的提示词内容" },
    },
    {
      id: "hidden",
      enabled: false,
      label: { "zh-CN": "隐藏模板" },
      text: { "zh-CN": "隐藏内容" },
    },
  ];
  const t = (key: any, values: any) => translate(key, "zh-CN", values);
  await act(async () =>
    root.render(
      <BehaviorSettings
        {...({
          t,
          globalPrompt: "",
          setGlobalPrompt: apply,
          updatePreferences: { isPending: false },
        } as any)}
      />
    )
  );
  const button = Array.from(host.querySelectorAll("button")).find(
    button => button.textContent === "API 模板按钮"
  )!;
  await act(async () => button.click());
  expect(apply).toHaveBeenCalledWith("这是实际使用的提示词内容");
  expect(host.textContent).not.toContain("隐藏模板");
  const character = {
    name: "预览角色",
    personality: "温柔",
    appearance: "自然",
    customPrompt: "角色补充指令",
    intimacyPoints: 0,
  };
  const preferences = {
    globalPrompt: "这是实际使用的提示词内容",
    replyLanguage: "中文",
  };
  const props = {
    t,
    showCustomPrompt: true,
    setShowCustomPrompt: vi.fn(),
    showPromptPreview: true,
    setShowPromptPreview: vi.fn(),
    customPrompt: character.customPrompt,
    setCustomPrompt: vi.fn(),
    previewCharacter: character,
    previewMemoryEnabled: false,
    apiConfig: { preferences },
  };
  const render = () =>
    act(async () => root.render(<CharacterPrompt {...(props as any)} />));
  await render();
  expect(host.querySelector("pre")!.textContent).toBe(
    buildChatSystemPrompt(mock.data, character, preferences, {
      memoryEnabled: false,
    })
  );
  mock.data = structuredClone(mock.data);
  mock.data.prompts.chat.expression.warm = "发布后的新表达规则";
  await render();
  expect(host.querySelector("pre")!.textContent).toContain(
    "发布后的新表达规则"
  );
  expect(host.querySelector("pre")!.textContent).toContain(
    "长期记忆已关闭或暂停"
  );
});

it("renders API pose IDs and changed unlock levels and removes disabled poses", async () => {
  const select = vi.fn();
  mock.data.selfies.poses = [
    {
      ...productFixture.selfies.poses[0],
      id: "api-orbit",
      minLevel: 3,
      label: { "zh-CN": "API 新姿势" },
    },
    {
      ...productFixture.selfies.poses[0],
      id: "disabled",
      enabled: false,
      label: { "zh-CN": "已禁用姿势" },
    },
  ];
  const render = () =>
    act(async () =>
      root.render(
        <SelfiePoseDialog
          open
          onOpenChange={() => {}}
          intimacyLevel={2}
          canCouplePhoto={false}
          onSelectPose={select}
          onCouplePhoto={() => {}}
        />
      )
    );
  await render();
  const button = () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(b =>
      b.textContent?.includes("API 新姿势")
    )!;
  expect(button().disabled).toBe(true);
  expect(document.body.textContent).not.toContain("已禁用姿势");
  mock.data = structuredClone(mock.data);
  mock.data.selfies.poses[0].minLevel = 2;
  await render();
  expect(button().disabled).toBe(false);
  await act(async () => button().click());
  expect(select).toHaveBeenCalledWith("api-orbit", "reference");
});

it("derives level, unlocked content, reward amounts and daily cap from the same response", async () => {
  mock.data.intimacy.levels[1].requiredPoints = 4;
  mock.data.intimacy.levels[1].name = { "zh-CN": "API 关系阶段" };
  mock.data.intimacy.dailyPointsLimit = 73;
  mock.data.intimacy.minimumTextLength = 6;
  Object.assign(mock.data.intimacy.rules.text_message, {
    basePoints: 13,
    bonusPoints: 4,
    bonusThreshold: 21,
    dailyLimit: 9,
    cooldownMinutes: 3,
  });
  mock.data.selfies.poses = [
    {
      ...productFixture.selfies.poses[0],
      id: "api-pose",
      minLevel: 2,
      label: { "zh-CN": "动态解锁内容" },
    },
  ];
  await act(async () =>
    root.render(
      <IntimacyPanel
        open
        onOpenChange={() => {}}
        intimacyLevel={10}
        intimacyPoints={5}
        consecutiveDays={2}
        girlfriendName="测试角色"
      />
    )
  );
  const text = document.body.textContent!;
  expect(text).toContain("API 关系阶段");
  expect(text).toContain("动态解锁内容");
  expect(text).toContain("73");
  expect(text).toContain("+13 ~ +17");
  expect(text).toContain("文字至少 6 字");
  expect(text).toContain("超过 21");
  expect(text).toContain("每日最多 9 次；冷却 3 分钟");
  expect(text).not.toContain("每日最多获得 200");
});

it("displays new plan names, annual prices and actual quotas, and binds checkout to the current account", async () => {
  const current = structuredClone(productFixture.billing.plans[0]);
  current.id = "basic-api";
  current.label = { "zh-CN": "API 基础档" };
  current.limits.dailyMessages = 8;
  const upgrade = {
    ...structuredClone(productFixture.billing.plans[1]),
    id: "annual-api",
    label: { "zh-CN": "API 年卡" },
    price: { amount: 66, currency: "CNY", period: "year" },
    checkoutUrl: "https://checkout.example.test/annual",
  };
  mock.billing = {
    mode: "lemonsqueezy",
    plans: [current, upgrade],
    defaultTierId: current.id,
    tier: current.id,
    limits: current.limits,
    byok: { chat: false, selfie: false },
    subscription: null,
    usage: {
      chatToday: 3,
      chatLimit: 8,
      selfiesUsed: 0,
      selfieLimit: 2,
      selfiePeriod: "month",
    },
  };
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  await act(async () => root.render(<BillingCard />));
  expect(host.textContent).toContain("API 基础档");
  expect(host.textContent).toContain("3 / 8");
  expect(host.textContent).toContain("0 / 2");
  expect(host.textContent).toContain("API 年卡");
  expect(host.textContent).toContain("66");
  expect(host.textContent).toContain("/年");
  expect(host.textContent).not.toContain("每天 30 条");
  await act(async () =>
    host.querySelector<HTMLButtonElement>("button")!.click()
  );
  const url = new URL(open.mock.calls[0][0] as string);
  expect(url.searchParams.get("checkout[custom][user_id]")).toBe("ui-user");
});

it("keeps missing configuration in loading/error states and retries without showing seed data", async () => {
  mock.data = undefined;
  const render = () =>
    act(async () =>
      root.render(
        <SelfiePoseDialog
          open
          onOpenChange={() => {}}
          intimacyLevel={10}
          canCouplePhoto
          onSelectPose={() => {}}
          onCouplePhoto={() => {}}
        />
      )
    );
  await render();
  expect(document.querySelector('[role="status"]')).not.toBeNull();
  expect(document.body.textContent).not.toContain("日常自拍");
  mock.error = new Error("unavailable");
  await render();
  expect(document.querySelector('[role="alert"]')).not.toBeNull();
  const retry = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button")
  ).find(b => b.textContent?.includes(translate("explore:retry", "zh-CN")))!;
  await act(async () => retry.click());
  expect(mock.refetch).toHaveBeenCalledOnce();
});

it("relocalizes the current snapshot with Chinese fallback and polls published changes", async () => {
  function Probe() {
    const policy = useProductConfig();
    return <p>{policy.data?.selfies.poses[0].label}</p>;
  }
  mock.data.selfies.poses[0].label = {
    "zh-CN": "只有中文",
    en: "English pose",
  };
  mock.locale = "en";
  await act(async () => root.render(<Probe />));
  expect(host.textContent).toBe("English pose");
  mock.locale = "ja";
  await act(async () => root.render(<Probe />));
  expect(host.textContent).toBe("只有中文");
  mock.data = structuredClone(mock.data);
  mock.data.selfies.poses[0].label = { "zh-CN": "下一次发布" };
  await act(async () => root.render(<Probe />));
  expect(host.textContent).toBe("下一次发布");
  expect(mock.options).toMatchObject({
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });
});
