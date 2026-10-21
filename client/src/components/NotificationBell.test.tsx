// @vitest-environment jsdom
/** 通知只刷新站内状态；推送 URL 已读反馈经服务端成功后才清除参数。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { NotificationBell } from "./NotificationBell";

import { productFixture } from "../../../server/testProductConfig";
const mock = vi.hoisted(() => ({
  search: "",
  slots: 0,
  options: {} as Record<string, any>,
  read: vi.fn(),
  linkedRead: vi.fn(),
  allRead: vi.fn(),
  proactive: vi.fn(),
  refetchCount: vi.fn(),
  refetchList: vi.fn(),
  navigate: vi.fn(),
  open: vi.fn(),
  error: vi.fn(),
  notification: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: i18n.getFixedT("zh-CN") as Translator,
    locale: "zh-CN",
  }),
}));
vi.mock("@/hooks/useCompanionChat", () => ({
  useCompanionChat: () => ({ open: mock.open, pending: null }),
}));
vi.mock("wouter", () => ({
  useSearch: () => mock.search,
  useLocation: () => ["/chats", mock.navigate],
}));
vi.mock("sonner", () => ({ toast: { error: mock.error } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    productConfig: { get: { useQuery: () => ({ data: productFixture }) } },
    notification: {
      unreadCount: {
        useQuery: () => ({ data: 1, refetch: mock.refetchCount }),
      },
      list: {
        useQuery: () => ({
          data: [
            {
              id: 7,
              girlfriendId: 3,
              isRead: false,
              type: "random",
              createdAt: new Date(),
              title: {
                key: "notifications:title.thinkingOfYou",
                values: { name: "小雨" },
              },
              content: {
                key: "notifications:eventUpcoming",
                values: {
                  name: "小雨",
                  memory: "准备面试",
                  eventDay: "2026-10-21",
                },
              },
            },
          ],
          isLoading: false,
          refetch: mock.refetchList,
        }),
      },
      checkProactive: {
        useMutation: (options: any) => {
          mock.options.proactive = options;
          return { mutate: mock.proactive };
        },
      },
      markRead: {
        useMutation: (options: any) => {
          const linked = mock.slots++ % 2 === 1;
          mock.options[linked ? "linked" : "read"] = options;
          return {
            mutate: linked ? mock.linkedRead : mock.read,
            isPending: false,
          };
        },
      },
      markAllRead: {
        useMutation: (options: any) => {
          mock.options.allRead = options;
          return { mutate: mock.allRead, isPending: false };
        },
      },
    },
  },
}));
let root: Root;
let container: HTMLDivElement;
const t = i18n.getFixedT("zh-CN") as Translator;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mock.search = "";
  mock.slots = 0;
  mock.options = {};
  window.history.replaceState({}, "", "/chats");
  mock.navigate.mockImplementation((url: string) => {
    window.history.replaceState({}, "", url);
    mock.search = window.location.search.slice(1);
  });
  mock.open.mockResolvedValue(true);
  mock.refetchCount.mockResolvedValue({});
  mock.refetchList.mockResolvedValue({});
  vi.stubGlobal(
    "Notification",
    Object.assign(mock.notification, { permission: "granted" })
  );
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
  vi.useRealTimers();
});
async function settle(action: () => void) {
  await act(async () => {
    action();
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}
async function render() {
  await settle(() => root.render(<NotificationBell />));
}
function link(search: string) {
  mock.search = search;
  window.history.replaceState({}, "", `/chats?${search}#history`);
}
async function openBell() {
  await settle(() =>
    container
      .querySelector<HTMLButtonElement>(
        `[aria-label="${t("notifications:notifications")}"]`
      )!
      .click()
  );
}

it("acknowledges a positive notification id once and preserves its parameter until success", async () => {
  link("notification=42&filter=unread");
  await render();
  await render();
  expect(mock.linkedRead).toHaveBeenCalledOnce();
  expect(mock.linkedRead).toHaveBeenCalledWith({ id: 42 });
  expect(window.location.search).toContain("notification=42");
  expect(mock.navigate).not.toHaveBeenCalled();
  await act(async () =>
    mock.options.linked.onSuccess({ success: true }, { id: 42 })
  );
  expect(window.location.search).toBe("?filter=unread");
  expect(window.location.hash).toBe("#history");
  expect(mock.navigate).toHaveBeenCalledWith("/chats?filter=unread#history", {
    replace: true,
  });
  expect(mock.refetchCount).toHaveBeenCalledOnce();
  expect(mock.refetchList).toHaveBeenCalledOnce();
});
it.each([
  "0",
  "-1",
  "1.5",
  "1e3",
  "01",
  "NaN",
  "9007199254740992",
  "1&notification=2",
])("ignores invalid notification parameter %j", async value => {
  link(`notification=${value}`);
  await render();
  expect(mock.linkedRead).not.toHaveBeenCalled();
  expect(mock.navigate).not.toHaveBeenCalled();
});
it("keeps foreign or failed URL feedback visible and allows an explicit retry", async () => {
  link("notification=99");
  await render();
  await act(async () =>
    mock.options.linked.onError({ data: { code: "NOT_FOUND" } }, { id: 99 })
  );
  expect(window.location.search).toBe("?notification=99");
  expect(mock.navigate).not.toHaveBeenCalled();
  expect(mock.refetchCount).not.toHaveBeenCalled();
  await render();
  expect(mock.linkedRead).toHaveBeenCalledTimes(1);
  await openBell();
  const alert = document.querySelector('[role="alert"]')!;
  expect(alert.textContent).toContain(t("notifications:clickFeedbackFailed"));
  await settle(() => alert.querySelector<HTMLButtonElement>("button")!.click());
  expect(mock.linkedRead).toHaveBeenCalledTimes(2);
});
it("does not remove a newer notification parameter when an older acknowledgment finishes", async () => {
  link("notification=42");
  await render();
  link("notification=43");
  await render();
  await act(async () => mock.options.linked.onSuccess({}, { id: 42 }));
  expect(window.location.search).toBe("?notification=43");
  expect(mock.navigate).not.toHaveBeenCalled();
});
it("removes an obsolete feedback error after the notification link is removed", async () => {
  link("notification=99");
  await render();
  await act(async () => mock.options.linked.onError({}, { id: 99 }));
  link("filter=unread");
  await render();
  await openBell();
  expect(document.querySelector('[role="alert"]')).toBeNull();
});
it("refreshes only the in-app count and open list without creating a second browser notification", async () => {
  await render();
  await openBell();
  await act(async () =>
    mock.options.proactive.onSuccess({
      id: 7,
      title: { key: "notifications:privatePreview" },
      content: { key: "notifications:privatePreview" },
    })
  );
  expect(mock.refetchCount).toHaveBeenCalledOnce();
  expect(mock.refetchList).toHaveBeenCalledOnce();
  expect(mock.notification).not.toHaveBeenCalled();
});
it("does not refresh a closed list for an empty proactive check", async () => {
  await render();
  await act(async () => mock.options.proactive.onSuccess(null));
  expect(mock.refetchCount).not.toHaveBeenCalled();
  expect(mock.refetchList).not.toHaveBeenCalled();
  expect(mock.notification).not.toHaveBeenCalled();
});
it("marks a list notification read only after its conversation opens", async () => {
  await render();
  await openBell();
  const item = document.querySelector<HTMLButtonElement>(
    '[role="dialog"] .group button'
  )!;
  await settle(() => item.click());
  expect(mock.open).toHaveBeenCalledWith(3);
  expect(mock.read).toHaveBeenCalledWith({ id: 7 });
  expect(mock.notification).not.toHaveBeenCalled();
});
it("keeps a list notification unread when opening its conversation fails", async () => {
  mock.open.mockResolvedValue(false);
  await render();
  await openBell();
  const item = document.querySelector<HTMLButtonElement>(
    '[role="dialog"] .group button'
  )!;
  await settle(() => item.click());
  expect(mock.read).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
});
it("checks proactively on its schedule without requesting browser notification permission", async () => {
  vi.useFakeTimers();
  await act(async () => root.render(<NotificationBell />));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300000);
  });
  expect(mock.proactive).toHaveBeenCalledTimes(2);
  expect(mock.notification).not.toHaveBeenCalled();
});
