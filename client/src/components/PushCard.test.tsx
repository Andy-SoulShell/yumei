// @vitest-environment jsdom
/** 推送开关以本设备端点为准，不受账号其他设备订阅影响。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PushCard } from "./PushCard";

const mock = vi.hoisted(() => ({
  endpoints: new Set<string>(),
  getSubscription: vi.fn(),
  subscribe: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  invalidate: vi.fn(),
  requestPermission: vi.fn(),
  queries: [] as Array<{ endpoint: string | null } | undefined>,
}));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ push: { status: { invalidate: mock.invalidate } } }),
    push: {
      status: {
        useQuery: (input?: { endpoint: string | null }) => {
          mock.queries.push(input);
          return {
            data: {
              configured: true,
              subscribed: input
                ? !!input.endpoint && mock.endpoints.has(input.endpoint)
                : mock.endpoints.size > 0,
            },
          };
        },
      },
      publicKey: { useQuery: () => ({ data: { key: "dGVzdA" } }) },
      subscribe: { useMutation: () => ({ mutateAsync: mock.save }) },
      unsubscribe: { useMutation: () => ({ mutateAsync: mock.remove }) },
    },
  },
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  mock.endpoints.clear();
  mock.queries.length = 0;
  mock.getSubscription.mockResolvedValue(null);
  mock.requestPermission.mockResolvedValue("granted");
  mock.invalidate.mockResolvedValue(undefined);
  mock.save.mockImplementation(async ({ endpoint }: { endpoint: string }) => {
    mock.endpoints.add(endpoint);
  });
  mock.remove.mockImplementation(async ({ endpoint }: { endpoint: string }) => {
    mock.endpoints.delete(endpoint);
  });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { requestPermission: mock.requestPermission });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: mock.getSubscription,
          subscribe: mock.subscribe,
        },
      }),
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Reflect.deleteProperty(navigator, "serviceWorker");
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => {
    root.render(<PushCard />);
  });
}
async function click() {
  await act(async () => {
    container.querySelector("button")!.click();
  });
}
it("offers enable on an unsubscribed device when another device is already subscribed", async () => {
  mock.endpoints.add("https://push.example.test/other-device");
  await render();
  expect(container.textContent).toContain("notifications:enablePush");
  expect(container.textContent).not.toContain(
    "notifications:disablePushOnThisDevice"
  );
});
it("enables and queries the endpoint actually issued for this browser", async () => {
  const endpoint = "https://push.example.test/this-device";
  mock.subscribe.mockResolvedValue({
    endpoint,
    toJSON: () => ({ keys: { p256dh: "public", auth: "auth" } }),
  });
  await render();
  await click();
  expect(mock.save).toHaveBeenCalledWith({
    endpoint,
    keys: { p256dh: "public", auth: "auth" },
  });
  expect(mock.queries.at(-1)).toEqual({ endpoint });
  expect(container.textContent).toContain(
    "notifications:disablePushOnThisDevice"
  );
});
it("disables this device while leaving other devices enabled", async () => {
  const endpoint = "https://push.example.test/this-device";
  const unsubscribe = vi.fn().mockResolvedValue(true);
  mock.getSubscription.mockResolvedValue({ endpoint, unsubscribe });
  mock.endpoints.add(endpoint);
  mock.endpoints.add("https://push.example.test/other-device");
  await render();
  await click();
  expect(mock.remove).toHaveBeenCalledWith({ endpoint });
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(mock.endpoints.size).toBe(1);
  expect(container.textContent).toContain("notifications:enablePush");
});
it("keeps a denied permission visible after the toast disappears", async () => {
  mock.requestPermission.mockResolvedValue("denied");
  await render();
  await click();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "notifications:notificationPermissionWasDenied"
  );
  expect(mock.save).not.toHaveBeenCalled();
});
it("keeps a successful subscription distinct from a failed status refresh", async () => {
  mock.invalidate.mockRejectedValueOnce(new Error("offline refresh"));
  mock.subscribe.mockResolvedValue({
    endpoint: "https://push.example.test/new-device",
    toJSON: () => ({ keys: { p256dh: "public", auth: "auth" } }),
  });
  await render();
  await click();
  expect(mock.save).toHaveBeenCalledOnce();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "settingsFlow:refreshFailed"
  );
  expect(container.textContent).toContain(
    "notifications:disablePushOnThisDevice"
  );
});
it("explains unsupported push instead of silently removing the device setting", async () => {
  Reflect.deleteProperty(window, "PushManager");
  await render();
  expect(container.textContent).toContain("settingsFlow:pushUnsupported");
  expect(container.querySelector("button")).toBeNull();
});
