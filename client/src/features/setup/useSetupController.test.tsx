import { DEFAULT_COMPANION_BEHAVIOR } from "../../../../server/testProductConfig";
// @vitest-environment jsdom
/** 编辑中刷新、头像操作和清空字段均不得破坏用户草稿。 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSetupController } from "./useSetupController";

import { discoveryFixture } from "@/features/discovery/testFixtures";
const getCharacterPreset = (id: string) =>
  discoveryFixture.characters.find(item => item.id === id);
import { getPresetBehavior } from "../../../../server/seeds/presetBehavior";
vi.mock("@/features/discovery/useDiscovery", async () => {
  const { discoveryFixture } =
    await import("@/features/discovery/testFixtures");
  return {
    useDiscovery: () => ({
      data: mock.discoveryLoading
        ? undefined
        : (mock.discoveryData ?? discoveryFixture),
      isLoading: mock.discoveryLoading,
      error: mock.discoveryError,
      refetch: mock.discoveryRefetch,
    }),
  };
});
vi.mock("@/features/product/useProductConfig", async () => {
  const { productFixture } =
    await import("../../../../server/testProductConfig");
  return { useProductConfig: () => ({ raw: productFixture }) };
});
const mock = vi.hoisted(() => ({
  discoveryData: undefined as any,
  discoveryLoading: false,
  discoveryError: null as Error | null,
  discoveryRefetch: vi.fn(),
  roles: [] as any[],
  update: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  navigate: vi.fn(),
  invalidate: vi.fn(),
  error: vi.fn(),
  options: [] as any[],
  calls: 0,
  editId: "1" as string | undefined,
  search: "",
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/setup/1", mock.navigate],
  useParams: () => ({ id: mock.editId }),
  useSearch: () => mock.search,
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
      create: {
        useMutation: () => ({ mutate: mock.create, isPending: false }),
      },
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
let remount: () => Promise<void>;
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mock.discoveryData = undefined;
  mock.discoveryLoading = false;
  mock.discoveryError = null;
  mock.calls = 0;
  mock.editId = "1";
  mock.search = "";
  mock.roles = [
    {
      id: 1,
      name: "原名",
      personality: "温柔",
      appearance: "长发",
      interests: "音乐",
      referenceImageUrl: "/reference.jpg",
      avatarUrl: "/avatar.jpg",
      behavior: {
        ...DEFAULT_COMPANION_BEHAVIOR,
        expression: "reserved",
        userNickname: "小米",
        examples: [{ user: "晚安", assistant: "明天再一起看星星。" }],
      },
    },
  ];
  mock.invalidate.mockResolvedValue(undefined);
  function Probe() {
    controller = useSetupController();
    return null;
  }
  let root = createRoot(document.createElement("div"));
  render = () => act(async () => root.render(<Probe />));
  unmount = () => act(async () => root.unmount());
  remount = async () => {
    await unmount();
    root = createRoot(document.createElement("div"));
    await render();
  };
  await render();
});
afterEach(async () => {
  await unmount();
});
it("does not replace unsaved fields when the character query refreshes", async () => {
  await act(async () => {
    controller.setName("未保存的名字");
    controller.setPersonality("未保存的性格");
    controller.setBehavior(previous => ({
      ...previous,
      expression: "playful",
    }));
  });
  mock.roles = [{ ...mock.roles[0], avatarUrl: "/new-avatar.jpg" }];
  await render();
  expect(controller.name).toBe("未保存的名字");
  expect(controller.personality).toBe("未保存的性格");
  expect(controller.behavior.expression).toBe("playful");
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
it("loads saved style and examples and sends edited behavior in the update", async () => {
  expect(controller.behavior).toEqual(mock.roles[0].behavior);
  await act(async () =>
    controller.setBehavior(previous => ({
      ...previous,
      userNickname: " 阿雨 ",
      examples: [{ user: " 今天好累 ", assistant: " 先坐一会儿吧。 " }],
    }))
  );
  await act(async () => {
    await controller.handleSubmit({ preventDefault: vi.fn() } as any);
  });
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 1,
      behavior: expect.objectContaining({
        expression: "reserved",
        userNickname: "阿雨",
        examples: [{ user: "今天好累", assistant: "先坐一会儿吧。" }],
      }),
    })
  );
});
it("gives existing characters with no behavior the editable default", async () => {
  mock.roles = [{ ...mock.roles[0], behavior: null }];
  await remount();
  expect(controller.behavior).toEqual(DEFAULT_COMPANION_BEHAVIOR);
  await act(async () => {
    await controller.handleSubmit({ preventDefault: vi.fn() } as any);
  });
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ behavior: DEFAULT_COMPANION_BEHAVIOR })
  );
});
it("initializes a preset URL and submits customized behavior on creation", async () => {
  mock.editId = undefined;
  mock.search = "?preset=xiaotao";
  await remount();
  expect(controller.presetId).toBe("xiaotao");
  expect(controller.behavior).toEqual(getPresetBehavior("xiaotao"));
  await act(async () =>
    controller.setBehavior(previous => ({
      ...previous,
      initiative: "quiet",
      userNickname: "阿雨",
    }))
  );
  await act(async () => {
    await controller.handleSubmit({ preventDefault: vi.fn() } as any);
  });
  expect(mock.create).toHaveBeenCalledWith(
    expect.objectContaining({
      presetId: "xiaotao",
      behavior: expect.objectContaining({
        initiative: "quiet",
        userNickname: "阿雨",
      }),
    })
  );
});
it("replaces behavior with each chosen preset and resets it for a custom character", async () => {
  mock.editId = undefined;
  await remount();
  await act(async () =>
    controller.handleSelectPreset(getCharacterPreset("xiaotao")!)
  );
  expect(controller.behavior).toEqual(getPresetBehavior("xiaotao"));
  await act(async () =>
    controller.handleSelectPreset(getCharacterPreset("rin")!)
  );
  expect(controller.behavior).toEqual(getPresetBehavior("rin"));
  await act(async () => controller.handleSelectPreset(null));
  expect(controller.presetId).toBeNull();
  expect(controller.behavior).toEqual(DEFAULT_COMPANION_BEHAVIOR);
});
it("includes behavior when creating a custom character from an uploaded image", async () => {
  mock.editId = undefined;
  await remount();
  await act(async () => {
    controller.setName("小雨");
    controller.setPersonality("温柔");
    controller.setAppearance("长发");
    controller.setBehavior(previous => ({ ...previous, expression: "direct" }));
    controller.handleImageChange({
      target: {
        files: [new File(["image"], "portrait.png", { type: "image/png" })],
      },
    } as any);
  });
  await act(async () => {
    await controller.handleSubmit({ preventDefault: vi.fn() } as any);
    await new Promise(resolve => setTimeout(resolve, 20));
  });
  expect(mock.create).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "小雨",
      referenceImageBase64: "aW1hZ2U=",
      referenceImageMimeType: "image/png",
      behavior: expect.objectContaining({ expression: "direct" }),
    })
  );
});
it("blocks incomplete and excessive examples, then allows corrected behavior", async () => {
  await act(async () =>
    controller.setBehavior(previous => ({
      ...previous,
      examples: [{ user: "你好", assistant: "   " }],
    }))
  );
  await act(async () => {
    await controller.handleSubmit({ preventDefault: vi.fn() } as any);
  });
  expect(controller.behaviorError).toBe(true);
  expect(mock.update).not.toHaveBeenCalled();
  await act(async () =>
    controller.setBehavior(previous => ({
      ...previous,
      examples: Array.from({ length: 6 }, () => ({
        user: "你好",
        assistant: "你好呀",
      })),
    }))
  );
  await act(async () => {
    await controller.handleSubmit({ preventDefault: vi.fn() } as any);
  });
  expect(mock.update).not.toHaveBeenCalled();
  await act(async () =>
    controller.setBehavior(previous => ({ ...previous, examples: [] }))
  );
  await act(async () => {
    await controller.handleSubmit({ preventDefault: vi.fn() } as any);
  });
  expect(controller.behaviorError).toBe(false);
  expect(mock.update).toHaveBeenCalledOnce();
});

it("initializes an asynchronously loaded preset once and preserves subsequent form edits", async () => {
  mock.editId = undefined;
  mock.search = "?preset=xiaotao";
  mock.discoveryLoading = true;
  await remount();
  expect(controller.presetLoading).toBe(true);
  expect(controller.name).toBe("");
  mock.discoveryLoading = false;
  await render();
  expect(controller.name).toBe(getCharacterPreset("xiaotao")!.name);
  await act(async () => controller.setName("用户正在编辑的名字"));
  mock.discoveryData = {
    ...discoveryFixture,
    characters: discoveryFixture.characters.map(item =>
      item.id === "xiaotao" ? { ...item, name: "已更新的官方名称" } : item
    ),
  };
  await render();
  expect(controller.name).toBe("用户正在编辑的名字");
});
