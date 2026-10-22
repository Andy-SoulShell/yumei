// @vitest-environment jsdom
/** 个人资料表单验证、草稿预览、失败重试与共享缓存同步。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n, type Translator } from "@shared/i18n";
import { ProfileSettings } from "./ProfileSettings";

const mock = vi.hoisted(() => ({
  user: {
    id: "profile-user",
    name: "Original",
    image: "/files/original.png",
    email: "account@example.test",
  },
  save: vi.fn(),
  setData: vi.fn(),
  cachedUser: null as {
    id: string;
    name: string;
    image: string | null;
    email: string;
  } | null,
  limit: { maxBytes: 1024, mimeTypes: ["image/png"] },
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: mock.user }),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: i18n.getFixedT("zh-CN") as Translator }),
}));
vi.mock("@/features/product/useProductConfig", () => ({
  useProductConfig: () => ({ data: { uploads: { avatar: mock.limit } } }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ auth: { me: { setData: mock.setData } } }),
    auth: {
      updateProfile: { useMutation: () => ({ mutateAsync: mock.save }) },
    },
  },
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mock.user = {
    id: "profile-user",
    name: "Original",
    image: "/files/original.png",
    email: "account@example.test",
  };
  mock.save.mockImplementation(async input => ({
    ...mock.user,
    name: input.name,
    image: input.avatar === null ? null : "/files/new.png",
  }));
  mock.cachedUser = mock.user;
  mock.setData.mockImplementation((_key, update) => {
    mock.cachedUser = update(mock.cachedUser);
    if (mock.cachedUser) mock.user = mock.cachedUser as typeof mock.user;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render() {
  await act(async () => root.render(<ProfileSettings />));
}
async function fillName(value: string) {
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>(
      'input[name="username"]'
    )!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
async function choose(file: File) {
  await act(async () => {
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 30));
  });
}
it("validates names and updates the cached user only after a successful save", async () => {
  await render();
  expect(
    container.querySelector<HTMLButtonElement>('button[type="submit"]')!
      .disabled
  ).toBe(true);
  await fillName("   ");
  await submit();
  expect(mock.save).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "用户名"
  );
  await fillName("  小雨  ");
  await submit();
  expect(mock.save).toHaveBeenCalledWith({ name: "小雨" });
  expect(mock.cachedUser?.name).toBe("小雨");
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    "个人资料已保存"
  );
  expect(
    container.querySelector<HTMLInputElement>('input[name="username"]')!.value
  ).toBe("小雨");
});

it("keeps the name and avatar removal draft after failure and saves both on retry", async () => {
  mock.save.mockRejectedValueOnce(new Error("offline"));
  await render();
  await fillName("New name");
  await act(async () => {
    Array.from(container.querySelectorAll("button"))
      .find(button => button.textContent === "移除头像")!
      .click();
  });
  expect(mock.save).not.toHaveBeenCalled();
  await submit();
  expect(mock.setData).not.toHaveBeenCalled();
  expect(
    container.querySelector<HTMLInputElement>('input[name="username"]')!.value
  ).toBe("New name");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "已保留修改"
  );
  await submit();
  expect(mock.save).toHaveBeenLastCalledWith({
    name: "New name",
    avatar: null,
  });
  expect(mock.user.image).toBeNull();
});

it("rejects disallowed and oversized files, then previews a valid avatar without saving it", async () => {
  await render();
  await choose(new File(["text"], "fake.svg", { type: "image/svg+xml" }));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "PNG"
  );
  await choose(
    new File([new Uint8Array(1025)], "large.png", { type: "image/png" })
  );
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "1 KiB"
  );
  await choose(new File(["test"], "avatar.png", { type: "image/png" }));
  expect(mock.save).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')).toBeNull();
  await submit();
  expect(mock.save).toHaveBeenCalledWith({
    name: "Original",
    avatar: { imageBase64: "dGVzdA==", mimeType: "image/png" },
  });
  expect(mock.user.image).toBe("/files/new.png");
});

it("prevents duplicate submissions and edits while a save is pending", async () => {
  let finish!: (value: typeof mock.user) => void;
  mock.save.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  await render();
  await fillName("New");
  await submit();
  await submit();
  expect(mock.save).toHaveBeenCalledTimes(1);
  expect(
    container.querySelector<HTMLInputElement>('input[name="username"]')!
      .disabled
  ).toBe(true);
  await act(async () => finish({ ...mock.user, name: "New" }));
  expect(
    container.querySelector<HTMLButtonElement>('button[type="submit"]')!
      .disabled
  ).toBe(true);
});

it("does not restore the previous account cache if the user signs out during a save", async () => {
  let finish!: (value: typeof mock.user) => void;
  mock.save.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  await render();
  await fillName("New");
  await submit();
  mock.cachedUser = null;
  await act(async () => finish({ ...mock.user, name: "New" }));
  expect(mock.cachedUser).toBeNull();
});
