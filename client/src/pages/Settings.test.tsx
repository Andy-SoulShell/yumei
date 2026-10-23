// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Settings from "./Settings";
const mock = vi.hoisted(() => ({
  accountId: "a",
  proof: "",
  voice: vi.fn(),
  services: vi.fn(),
  model: vi.fn(),
}));
vi.mock("@/hooks/usePageBack", () => ({ usePageBack: () => vi.fn() }));
vi.mock("@/features/settings/useSettingsController", () => ({
  useSettingsController: () => ({
    t: (key: string) => key,
    accountId: mock.accountId,
    apiConfig: {},
    feedback: {},
    setVoiceExpanded: mock.voice,
    setServicesExpanded: mock.services,
    setModelExpanded: mock.model,
  }),
}));
vi.mock("@/features/settings/BehaviorSettings", () => ({
  BehaviorSettings: () => {
    const [text, set] = useState("chat draft");
    return (
      <button data-testid="draft" onClick={() => set("changed draft")}>
        {text}
      </button>
    );
  },
}));
vi.mock("@/features/settings/VoiceSettings", () => ({
  VoiceSettings: () => <p>voice content</p>,
}));
vi.mock("@/components/AppearanceSettings", () => ({
  AppearanceSettings: () => <p>appearance content</p>,
}));
vi.mock("@/features/settings/ProactivePreferences", () => ({
  ProactivePreferences: () => <p>notification content</p>,
}));
vi.mock("@/components/PushCard", () => ({ PushCard: () => null }));
vi.mock("@/components/BillingCard", () => ({
  BillingCard: () => <p>billing content</p>,
}));
vi.mock("@/features/settings/ProfileSettings", () => ({
  ProfileSettings: () => <p>profile content</p>,
}));
vi.mock("@/features/settings/PasswordSettings", () => ({
  PasswordSettings: () => null,
}));
vi.mock("@/features/settings/PrivacySettings", () => ({
  PrivacySettings: () => {
    mock.proof = window.location.hash;
    return <p>privacy content</p>;
  },
}));
vi.mock("@/features/settings/ChatModelSettings", () => ({
  ChatModelSettings: () => <p>model content</p>,
}));
vi.mock("@/features/settings/ImageSettings", () => ({
  ImageSettings: () => <p>image content</p>,
}));
vi.mock("@/features/settings/TranscriptionSettings", () => ({
  TranscriptionSettings: () => <p>transcription content</p>,
}));
vi.mock("@/features/settings/SavedProviderKeys", () => ({
  SavedProviderKeys: () => <p>keys content</p>,
}));
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  mock.accountId = "a";
  mock.proof = "";
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/settings");
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    fn(0);
    return 1;
  });
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(<Settings />));
}
it("puts everyday tasks first and keeps drafts when collapsed", async () => {
  await render();
  expect(
    Array.from(container.querySelectorAll("section")).map(section => section.id)
  ).toEqual([
    "chat",
    "voice",
    "appearance",
    "notifications",
    "billing",
    "account",
    "advanced",
  ]);
  expect(
    container.querySelector("#chat-title")?.getAttribute("aria-expanded")
  ).toBe("true");
  expect(container.querySelector("#advanced-content")).toBeNull();
  expect(container.textContent).not.toContain("profile content");
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[data-testid="draft"]')!.click()
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>("#chat-title")!.click()
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>("#chat-title")!.click()
  );
  expect(container.querySelector('[data-testid="draft"]')?.textContent).toBe(
    "changed draft"
  );
});
it("opens the nested task from a direct link without mounting other advanced forms", async () => {
  window.history.replaceState({}, "", "/settings#image");
  await render();
  expect(
    container.querySelector("#advanced-title")?.getAttribute("aria-expanded")
  ).toBe("true");
  expect(
    container.querySelector("#image-title")?.getAttribute("aria-expanded")
  ).toBe("true");
  expect(container.textContent).toContain("image content");
  expect(container.textContent).not.toContain("model content");
  expect(mock.services).toHaveBeenLastCalledWith(true);
});
it("opens account settings for a deletion link and leaves its proof for PrivacySettings", async () => {
  const hash = `#deleteToken=${"a".repeat(48)}`;
  window.history.replaceState({}, "", `/settings${hash}`);
  await render();
  expect(
    container.querySelector("#account-title")?.getAttribute("aria-expanded")
  ).toBe("true");
  expect(mock.proof).toBe(hash);
});
it("remounts independent account forms after switching accounts", async () => {
  await render();
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[data-testid="draft"]')!.click()
  );
  mock.accountId = "b";
  await render();
  expect(container.querySelector('[data-testid="draft"]')?.textContent).toBe(
    "chat draft"
  );
});
