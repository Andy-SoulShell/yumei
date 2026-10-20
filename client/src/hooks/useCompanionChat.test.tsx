// @vitest-environment jsdom
/** 角色选择与真实接口之间的流程回归，覆盖登录、重试与重复点击。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHARACTER_PRESETS } from "@shared/characterPresets";
import { useCompanionChat } from "./useCompanionChat";

const mock = vi.hoisted(() => ({
  authenticated: true,
  location: "/",
  query: "",
  roles: [] as Array<{
    id: number;
    name: string;
    personality: string;
    appearance: string;
  }>,
  navigate: vi.fn(),
  create: vi.fn(),
  resume: vi.fn(),
  fetch: vi.fn(),
  invalidate: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("wouter", () => ({
  useLocation: () => [mock.location, mock.navigate],
  useSearch: () => mock.query,
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: mock.authenticated }),
}));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: mock.toast } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      girlfriend: { list: { fetch: mock.fetch }, invalidate: mock.invalidate },
      conversation: { invalidate: mock.invalidate },
    }),
    girlfriend: {
      list: { useQuery: () => ({ data: mock.roles, isLoading: false }) },
      create: { useMutation: () => ({ mutateAsync: mock.create }) },
    },
    conversation: {
      resume: { useMutation: () => ({ mutateAsync: mock.resume }) },
    },
  },
}));

let root: Root;
let container: HTMLDivElement;
let chat: ReturnType<typeof useCompanionChat>;
const preset = CHARACTER_PRESETS[0];
function Harness() {
  chat = useCompanionChat();
  return null;
}
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mock.authenticated = true;
  mock.location = "/";
  mock.query = "";
  mock.roles = [];
  mock.invalidate.mockResolvedValue(undefined);
  mock.fetch.mockImplementation(async () => mock.roles);
  mock.create.mockImplementation(async () => {
    const role = { ...preset, id: 9 };
    mock.roles.push(role);
    return role;
  });
  mock.resume.mockResolvedValue({ id: 42 });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("companion chat entry", () => {
  it("sends visitors to login with their character selection and performs no writes", async () => {
    mock.authenticated = false;
    await act(async () => root.render(<Harness />));
    await act(async () => chat.open(preset));
    expect(mock.navigate).toHaveBeenCalledWith(
      "/login?next=%2F%3Fcharacter%3Dxiaotao"
    );
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.resume).not.toHaveBeenCalled();
  });
  it("continues an existing matching character without creating another", async () => {
    mock.roles = [{ ...preset, id: 7 }];
    let opened = false;
    await act(async () => {
      opened = await chat.open(preset);
    });
    expect(opened).toBe(true);
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.resume).toHaveBeenCalledWith({ girlfriendId: 7 });
    expect(mock.navigate).toHaveBeenCalledWith("/chat/42");
  });
  it("preserves the explore search, style and loaded page through login", async () => {
    mock.authenticated = false;
    mock.location = "/explore";
    mock.query = "q=coffee&style=realistic&page=2";
    await act(async () => root.render(<Harness />));
    await act(async () => chat.open(preset));
    expect(mock.navigate).toHaveBeenCalledWith(
      "/login?next=%2Fexplore%3Fq%3Dcoffee%26style%3Drealistic%26page%3D2%26character%3Dxiaotao"
    );
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("creates a preset using its canonical profile before resuming chat", async () => {
    await act(async () => chat.open(preset));
    expect(mock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        presetId: preset.id,
        personality: preset.personality,
        appearance: preset.appearance,
      })
    );
    expect(mock.resume).toHaveBeenCalledWith({ girlfriendId: 9 });
    expect(mock.navigate).toHaveBeenCalledWith("/chat/42");
  });
  it("blocks rapid duplicate clicks while the first request is pending", async () => {
    let finish!: (value: { id: number }) => void;
    mock.resume.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    let request!: Promise<boolean>;
    await act(async () => {
      request = chat.open(7);
      await chat.open(7);
    });
    expect(chat.pending).toBe(7);
    expect(mock.resume).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ id: 42 });
      await request;
    });
    expect(chat.pending).toBeNull();
  });
  it("preserves a newly created character when resuming fails, then reuses it on retry", async () => {
    mock.resume.mockRejectedValueOnce(new Error("Temporary failure"));
    await act(async () => chat.open(preset));
    expect(mock.toast).toHaveBeenCalled();
    expect(mock.navigate).not.toHaveBeenCalled();
    await act(async () => chat.open(preset));
    expect(mock.create).toHaveBeenCalledTimes(1);
    expect(mock.navigate).toHaveBeenCalledWith("/chat/42");
  });
  it("shows quota failures without attempting a conversation", async () => {
    mock.create.mockRejectedValueOnce(new Error("UPGRADE_REQUIRED"));
    await act(async () => chat.open(preset));
    expect(mock.resume).not.toHaveBeenCalled();
    expect(mock.toast).toHaveBeenCalled();
    expect(chat.pending).toBeNull();
  });
  it("opens existing photo generation through the selected character's conversation", async () => {
    await act(async () => chat.open(7, true));
    expect(mock.resume).toHaveBeenCalledWith({ girlfriendId: 7 });
    expect(mock.navigate).toHaveBeenCalledWith("/chat/42?selfie=1");
  });
});
