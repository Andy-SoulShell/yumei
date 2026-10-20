// @vitest-environment jsdom
/** 发送期间的新草稿、失败重试和生成反馈不会相互覆盖。 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useChatController } from "./useChatController";

const mock = vi.hoisted(() => ({
  pending: false,
  imagePending: false,
  options: {} as Record<string, any>,
  send: vi.fn(),
  selfie: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "qa", name: "Test" } }),
}));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/chat/42", vi.fn()],
  useParams: () => ({ id: "42" }),
  useSearch: () => "",
}));
vi.mock("sonner", () => ({
  toast: { success: mock.success, info: mock.info, error: mock.error },
}));
vi.mock("@/hooks/useTTS", () => ({
  useTTS: () => ({
    speak: vi.fn(),
    stop: vi.fn(),
    autoPlay: false,
    ttsProvider: "browser",
    playbackSpeed: 1,
    updateSpeed: vi.fn(),
  }),
}));
vi.mock("@/hooks/useVoiceRecorder", () => ({
  useVoiceRecorder: () => ({
    isRecording: false,
    isTranscribing: false,
    setIsTranscribing: vi.fn(),
    duration: 0,
    isSupported: false,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    cancelRecording: vi.fn(),
    setOnMaxDuration: vi.fn(),
  }),
}));
vi.mock("@/lib/trpc", () => {
  const mutation = (name: string, mutate = vi.fn(), pending = false) => ({
    useMutation: (options: any) => {
      mock.options[name] = options;
      return { mutate, isPending: pending };
    },
  });
  const query = (data: any) => ({
    useQuery: () => ({ data, isLoading: false, refetch: mock.refresh }),
  });
  return {
    trpc: {
      apiConfig: { get: query({ imageProvider: { configured: true } }) },
      voice: { transcribe: mutation("transcribe") },
      girlfriend: {
        getActive: query(null),
        list: query([{ id: 1, name: "小雨" }]),
      },
      conversation: {
        get: query({ girlfriendId: 1 }),
        getMessages: {
          useInfiniteQuery: () => ({
            data: { pages: [[]] },
            refetch: mock.refresh,
          }),
        },
        create: mutation("create"),
        resume: mutation("resume"),
      },
      mood: { get: query(null) },
      chat: {
        sendMessage: {
          useMutation: (options: any) => {
            mock.options.send = options;
            return { mutate: mock.send, isPending: mock.pending };
          },
        },
      },
      selfie: {
        quota: query({ unlimited: true }),
        generate: {
          useMutation: (options: any) => {
            mock.options.selfie = options;
            return { mutate: mock.selfie, isPending: mock.imagePending };
          },
        },
        generateCouple: mutation("couple"),
      },
      billing: { getInfo: query({ mode: "none" }) },
      useUtils: () => ({
        conversation: {
          invalidate: mock.refresh,
          listWithDetails: { invalidate: mock.refresh },
          list: { invalidate: mock.refresh },
        },
        girlfriend: { invalidate: mock.refresh },
      }),
    },
  };
});
let controller: ReturnType<typeof useChatController>;
let unmount: () => Promise<void>;
let render: () => Promise<void>;
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  mock.pending = false;
  mock.imagePending = false;
  mock.refresh.mockResolvedValue(undefined);
  mock.send.mockImplementation(variables =>
    mock.options.send.onMutate(variables)
  );
  function Probe() {
    controller = useChatController();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  render = () => act(async () => root.render(<Probe />));
  unmount = () => act(async () => root.unmount());
  await render();
});
afterEach(async () => {
  await unmount();
  vi.clearAllTimers();
  vi.useRealTimers();
});
const variables = { conversationId: 42, content: "第一条" };
async function sendFirst() {
  await act(async () => controller.setMessage(variables.content));
  await act(async () =>
    controller.handleSendMessage({ preventDefault: vi.fn() } as any)
  );
}
it("keeps the next draft when a pending reply completes", async () => {
  await sendFirst();
  expect(mock.send).toHaveBeenCalledWith(variables);
  expect(controller.message).toBe("");
  mock.pending = true;
  await render();
  await act(async () => controller.setMessage("下一条尚未发送"));
  await act(async () => {
    await mock.options.send.onSuccess(
      { assistantMessage: { content: "回复" } },
      variables
    );
  });
  expect(controller.message).toBe("下一条尚未发送");
});
it("retains failed text separately and retries it without consuming the next draft", async () => {
  await sendFirst();
  await act(async () => controller.setMessage("正在写的下一条"));
  await act(async () =>
    mock.options.send.onError({ message: "offline" }, variables)
  );
  expect(controller.message).toBe("正在写的下一条");
  expect(controller.failedMessages).toEqual([variables]);
  await act(async () => controller.retryMessage(controller.failedMessages[0]));
  expect(mock.send).toHaveBeenLastCalledWith(variables);
  expect(controller.message).toBe("正在写的下一条");
  await act(async () => {
    await mock.options.send.onSuccess({}, variables);
  });
  expect(controller.failedMessages).toEqual([]);
});
it("blocks duplicate submissions while a chat or image request is pending", async () => {
  await act(async () => controller.setMessage("草稿"));
  mock.pending = true;
  await render();
  await act(async () =>
    controller.handleSendMessage({ preventDefault: vi.fn() } as any)
  );
  mock.pending = false;
  mock.imagePending = true;
  await render();
  await act(async () =>
    controller.handleSendMessage({ preventDefault: vi.fn() } as any)
  );
  expect(mock.send).not.toHaveBeenCalled();
  expect(controller.message).toBe("草稿");
});
it("uses chat content for photo progress and success without success popups", async () => {
  await act(async () => controller.handleSelectPose("casual", "reference"));
  expect(mock.selfie).toHaveBeenCalled();
  await act(async () => {
    await mock.options.selfie.onSuccess({});
    await mock.options.couple.onSuccess({});
    await mock.options.send.onSuccess(
      { imageGeneration: "completed" },
      variables
    );
  });
  expect(mock.success).not.toHaveBeenCalled();
  expect(mock.info).not.toHaveBeenCalled();
});
