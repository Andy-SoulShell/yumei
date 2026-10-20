// @vitest-environment jsdom
/** 编辑中刷新、头像操作和清空字段均不得破坏用户草稿。 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSetupController } from "./useSetupController";
const mock = vi.hoisted(() => ({
  roles: [] as any[],
  update: vi.fn(),
  remove: vi.fn(),
  navigate: vi.fn(),
  invalidate: vi.fn(),
  error: vi.fn(),
  options: [] as any[],
  calls: 0,
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/setup/1", mock.navigate],
  useParams: () => ({ id: "1" }),
  useSearch: () => "",
}));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mock.error } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    girlfriend: {
      list: {
        useQuery: () => ({
          data: mock.roles,
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      update: {
        useMutation: (options: any) => {
          const slot = mock.calls++ % 2;
          mock.options[slot] = options;
          return {
            mutate: slot === 0 ? mock.update : mock.remove,
            isPending: false,
          };
        },
      },
      uploadAvatar: { useMutation: () => ({ mutate: vi.fn() }) },
      delete: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    apiConfig: { get: { useQuery: () => ({ data: {} }) } },
    useUtils: () => ({ girlfriend: { invalidate: mock.invalidate } }),
  },
}));
let controller: ReturnType<typeof useSetupController>;
let render: () => Promise<void>;
let unmount: () => Promise<void>;
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mock.calls = 0;
  mock.roles = [
    {
      id: 1,
      name: "原名",
      personality: "温柔",
      appearance: "长发",
      interests: "音乐",
      referenceImageUrl: "/reference.jpg",
      avatarUrl: "/avatar.jpg",
    },
  ];
  mock.invalidate.mockResolvedValue(undefined);
  function Probe() {
    controller = useSetupController();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  render = () => act(async () => root.render(<Probe />));
  unmount = () => act(async () => root.unmount());
  await render();
});
afterEach(async () => {
  await unmount();
});
it("does not replace unsaved fields when the character query refreshes", async () => {
  await act(async () => {
    controller.setName("未保存的名字");
    controller.setPersonality("未保存的性格");
  });
  mock.roles = [{ ...mock.roles[0], avatarUrl: "/new-avatar.jpg" }];
  await render();
  expect(controller.name).toBe("未保存的名字");
  expect(controller.personality).toBe("未保存的性格");
});
it("sends an empty interests field so an existing value can be cleared", async () => {
  await act(async () => controller.setInterests(""));
  await act(async () => {
    await controller.handleSubmit({ preventDefault: vi.fn() } as any);
  });
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ id: 1, interests: "" })
  );
});
it("removes only the avatar and keeps the form and its draft open", async () => {
  await act(async () => controller.setName("正在修改的名字"));
  await act(async () => controller.handleRemoveAvatar());
  expect(mock.remove).toHaveBeenCalledWith({
    id: 1,
    avatarUrl: null,
    avatarKey: null,
  });
  expect(controller.existingAvatarUrl).toBe("/avatar.jpg");
  await act(async () => {
    await mock.options[1].onSuccess();
    mock.options[1].onSettled();
  });
  expect(controller.existingAvatarUrl).toBeNull();
  expect(controller.name).toBe("正在修改的名字");
  expect(mock.navigate).not.toHaveBeenCalled();
});
it("rejects whitespace-only required fields without a request", async () => {
  await act(async () => controller.setName("   "));
  await act(async () => {
    await controller.handleSubmit({ preventDefault: vi.fn() } as any);
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.error).toHaveBeenCalled();
});
