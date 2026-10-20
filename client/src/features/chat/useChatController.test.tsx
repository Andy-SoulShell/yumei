// @vitest-environment jsdom
/** 发送期间的新草稿、失败重试和生成反馈不会相互覆盖。 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useChatController } from "./useChatController";

const mock = vi.hoisted(() => ({
  pending: false,
  imagePending: false,
  generating: false,
  history: [] as any[],
  streamTurns: [] as any[],
  options: {} as Record<string, any>,
  send: vi.fn(),
  streamSubmit: vi.fn(),
  streamStop: vi.fn(),
  streamRetry: vi.fn(),
  speak: vi.fn(),
  stopAudio: vi.fn(),
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
    speak: mock.speak,
    stop: mock.stopAudio,
    autoPlay: false,
    ttsProvider: "browser",
    playbackSpeed: 1,
    updateSpeed: vi.fn(),
  }),
}));
vi.mock("./useChatStream", async importOriginal => ({
  ...(await importOriginal<typeof import("./useChatStream")>()),
  useChatStream: (_conversationId: number, options: any) => {
    mock.options.stream = options;
    return {
      snapshot: null,
      turns: mock.streamTurns,
      pending: null,
      failures: [],
      connection: "connected",
      isAccepting: mock.pending,
      isGenerating: mock.generating,
      isStopping: false,
      submit: mock.streamSubmit,
      retry: mock.streamRetry,
      stop: mock.streamStop,
    };
  },
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
            data: { pages: [mock.history] },
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
  mock.generating = false;
  mock.history = [];
  mock.streamTurns = [];
  mock.streamStop.mockResolvedValue(true);
  mock.streamSubmit.mockResolvedValue(null);
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
async function sendFirst(content = variables.content) {
  await act(async () => controller.setMessage(content));
  await act(async () =>
    controller.handleSendMessage({ preventDefault: vi.fn() } as any)
  );
}
it("keeps the next draft when a pending reply completes", async () => {
  await sendFirst();
  expect(mock.streamSubmit).toHaveBeenCalledWith({
    content: variables.content,
  });
  expect(controller.message).toBe("");
  mock.pending = true;
  await render();
  await act(async () => controller.setMessage("下一条尚未发送"));
  await act(async () => {
    await mock.options.stream.onComplete(
      { status: "succeeded", assistantMessage: { content: "回复", id: 2 } },
      { content: variables.content }
    );
  });
  expect(controller.message).toBe("下一条尚未发送");
});
it("retains failed media requests separately and retries without consuming the next draft", async () => {
  const media = { ...variables, content: "给我发一张自拍" };
  await sendFirst(media.content);
  await act(async () => controller.setMessage("正在写的下一条"));
  await act(async () =>
    mock.options.send.onError({ message: "offline" }, media)
  );
  expect(controller.message).toBe("正在写的下一条");
  expect(controller.failedMessages).toEqual([media]);
  await act(async () => controller.retryMessage(controller.failedMessages[0]));
  expect(mock.send).toHaveBeenLastCalledWith(media);
  expect(controller.message).toBe("正在写的下一条");
  await act(async () => {
    await mock.options.send.onSuccess({}, media);
  });
  expect(controller.failedMessages).toEqual([]);
});
it("blocks duplicate submissions during acceptance or image generation", async () => {
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
  expect(mock.streamSubmit).not.toHaveBeenCalled();
  expect(controller.message).toBe("草稿");
});
it("sends supplements while generation runs and stops any earlier audio", async () => {
  mock.generating = true;
  await render();
  await sendFirst("补充一件事");
  expect(mock.streamSubmit).toHaveBeenCalledWith({ content: "补充一件事" });
  expect(mock.stopAudio).toHaveBeenCalledOnce();
});
it("stops text and audio before dispatching selfie requests", async () => {
  await sendFirst("给我发一张自拍");
  expect(mock.streamStop).toHaveBeenCalledOnce();
  expect(mock.stopAudio).toHaveBeenCalledOnce();
  expect(mock.send).toHaveBeenCalledWith({
    conversationId: 42,
    content: "给我发一张自拍",
  });
  expect(mock.streamSubmit).not.toHaveBeenCalled();
});
it("merges snapshots with history by canonical id and keeps saved stopped turns final", async () => {
  const user = {
    id: 1,
    role: "user",
    content: "原问题",
    createdAt: new Date(),
  };
  const stopped = {
    id: 2,
    role: "assistant",
    content: "已保存的片段",
    generationStatus: "stopped",
    createdAt: new Date(),
  };
  const nextUser = { ...user, id: 3, content: "补充" };
  const pending = {
    ...stopped,
    id: 4,
    content: "",
    generationStatus: "pending",
  };
  mock.history = [user, stopped, nextUser, pending];
  mock.streamTurns = [
    {
      id: "old",
      status: "running",
      userMessage: { ...user, createdAt: user.createdAt.toISOString() },
      assistantMessage: {
        ...stopped,
        generationStatus: "pending",
        content: "旧快照",
        createdAt: stopped.createdAt.toISOString(),
      },
    },
    {
      id: "new",
      status: "succeeded",
      userMessage: { ...nextUser, createdAt: nextUser.createdAt.toISOString() },
      assistantMessage: {
        ...pending,
        generationStatus: "succeeded",
        content: "完整回复",
        createdAt: pending.createdAt.toISOString(),
      },
    },
  ];
  await render();
  expect(controller.chatMessages.map(item => item.id)).toEqual([1, 2, 3, 4]);
  expect(controller.chatMessages[1].generationStatus).toBe("stopped");
  expect(controller.chatMessages[1].content).toBe("已保存的片段");
  expect(controller.chatMessages[3].content).toBe("完整回复");
});
it("retries accepted failures from their preceding user message without consuming a new draft", async () => {
  mock.history = [
    { id: 1, role: "user", content: "原问题" },
    {
      id: 2,
      role: "assistant",
      content: "部分回复",
      generationStatus: "failed",
    },
  ];
  await render();
  await act(async () => controller.setMessage("正在写的下一条"));
  await act(async () => controller.retryFailedGeneration(2));
  expect(mock.streamSubmit).toHaveBeenCalledWith({ content: "原问题" });
  expect(controller.message).toBe("正在写的下一条");
});
it("stops playback immediately when the user explicitly stops generation", async () => {
  await act(async () => {
    await controller.handleStopGeneration();
  });
  expect(mock.stopAudio).toHaveBeenCalledOnce();
  expect(mock.streamStop).toHaveBeenCalledOnce();
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
