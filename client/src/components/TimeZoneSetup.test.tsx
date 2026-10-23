// @vitest-environment jsdom
/** 首次确认前不挂载 AI 页面；设备检测不覆写现有账号，也不自动授权联系。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { TimeZoneSetup } from "./TimeZoneSetup";
import { TimeZonePicker } from "./TimeZonePicker";
import { i18n, type Translator } from "@shared/i18n";
const mock = vi.hoisted(() => ({
  data: null as any,
  save: vi.fn(),
  options: {} as any,
  setData: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ logout: mock.logout }),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: i18n.getFixedT("zh-CN") as Translator,
    locale: "zh-CN",
  }),
}));
vi.mock("@/lib/timeZone", async original => ({
  ...(await original<any>()),
  deviceTimeZone: () => "Asia/Shanghai",
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    notification: {
      preferences: {
        useQuery: () => ({
          data: mock.data,
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
      initializeTimeZone: {
        useMutation: (options: any) => {
          mock.options = options;
          return { mutate: mock.save, isPending: false };
        },
      },
    },
    useUtils: () => ({
      notification: { preferences: { setData: mock.setData } },
      memory: { state: { invalidate: vi.fn() } },
    }),
  },
}));
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mock.data = {
    userId: "qa",
    timeZone: "UTC",
    timeZoneInitialized: false,
    revision: 0,
  };
  mock.setData.mockImplementation((_input, data) => {
    mock.data = data;
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
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
  await act(async () =>
    root.render(
      <TimeZoneSetup>
        <div>private AI page</div>
      </TimeZoneSetup>
    )
  );
}
it("requires explicit confirmation of the detected zone before mounting the private page", async () => {
  await render();
  expect(container.textContent).not.toContain("private AI page");
  expect(mock.save).not.toHaveBeenCalled();
  const button = Array.from(document.querySelectorAll("button")).find(
    b => b.textContent === "确认并继续"
  )!;
  await act(async () => button.click());
  expect(mock.save).toHaveBeenCalledExactlyOnceWith({
    timeZone: "Asia/Shanghai",
  });
  await act(async () =>
    mock.options.onSuccess({
      ...mock.data,
      timeZone: "Asia/Shanghai",
      timeZoneInitialized: true,
      proactiveEnabled: false,
      revision: 1,
    })
  );
  await render();
  expect(container.textContent).toContain("private AI page");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it("preserves a saved UTC preference instead of silently changing it to the device zone", async () => {
  mock.data.timeZoneInitialized = true;
  await render();
  expect(container.textContent).toContain("private AI page");
  expect(mock.save).not.toHaveBeenCalled();
});
it("keeps the confirmation visible and provides retry after a failed save", async () => {
  await render();
  await act(async () => mock.options.onError(new Error("offline")));
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "网络"
  );
  expect(container.textContent).not.toContain("private AI page");
  expect(mock.save).not.toHaveBeenCalled();
});
it("searches and selects a localized time zone while retaining its IANA value", async () => {
  const change = vi.fn();
  await act(async () =>
    root.render(
      <TimeZonePicker id="picker" value="Asia/Shanghai" onChange={change} />
    )
  );
  expect(container.querySelector("#picker")?.textContent).toMatch(/中国|China/);
  await act(async () =>
    container.querySelector<HTMLButtonElement>("#picker")!.click()
  );
  const search = document.querySelector<HTMLInputElement>(
    'input[placeholder="搜索城市或时区"]'
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(search, "London");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const option = Array.from(
    document.querySelectorAll<HTMLElement>('[role="option"]')
  ).find(o => o.textContent?.includes("Europe/London"))!;
  expect(option).toBeDefined();
  await act(async () => option.click());
  expect(change).toHaveBeenCalledWith("Europe/London");
});
