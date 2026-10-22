// @vitest-environment jsdom
/** 发送期间的新草稿、失败重试和生成反馈不会相互覆盖。 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useChatController } from "./useChatController";

vi.mock("@/features/product/useProductConfig", async () => {
  const { productFixture, productView } =
    await import("../../../../server/testProductConfig");
  return {
    useProductConfig: () => ({
      raw: mock.productReady ? productFixture : undefined,
      data: mock.productReady ? productView : undefined,
    }),
  };
});

const mock = vi.hoisted(() => ({
  productReady: true,
  productFetch: vi.fn(),
  pending: false,
  imagePending: false,
  generating: false,
  userId: "qa",
  conversationId: "42",
  duration: 0,
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
  couple: vi.fn(),
  transcribe: vi.fn(),
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  cancelRecording: vi.fn(),
  setIsTranscribing: vi.fn(),
  refresh: vi.fn(),
  fetchNextPage: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: mock.userId, name: "Test" } }),
}));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/chat/42", vi.fn()],
  useParams: () => ({ id: mock.conversationId }),
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
    setIsTranscribing: mock.setIsTranscribing,
    duration: mock.duration,
    isSupported: false,
    startRecording: mock.startRecording,
    stopRecording: mock.stopRecording,
    cancelRecording: mock.cancelRecording,
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
      voice: { transcribe: mutation("transcribe", mock.transcribe) },
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
            fetchNextPage: mock.fetchNextPage,
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
        generateCouple: mutation("couple", mock.couple),
      },
      billing: { getInfo: query({ mode: "none" }) },
      useUtils: () => ({
        productConfig: { get: { fetch: mock.productFetch } },
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
let readers: {
  result: string | null;
  onload: (() => Promise<void> | void) | null;
  onloadend: (() => void) | null;
  onerror: (() => void) | null;
}[];
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mock.pending = false;
  mock.productReady = true;
  mock.imagePending = false;
  mock.generating = false;
  mock.userId = "qa";
  mock.conversationId = "42";
  mock.duration = 0;
  mock.startRecording.mockResolvedValue(undefined);
  mock.stopRecording.mockResolvedValue(null);
  readers = [];
  vi.stubGlobal(
    "FileReader",
    class {
      result: string | null = null;
      onload: (() => Promise<void> | void) | null = null;
      onloadend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        readers.push(this);
      }
      readAsDataURL() {}
    }
  );
  mock.history = [];
  mock.streamTurns = [];
  mock.streamStop.mockResolvedValue(true);
  mock.streamSubmit.mockResolvedValue(null);
  mock.refresh.mockResolvedValue(undefined);
  mock.fetchNextPage.mockResolvedValue(undefined);
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
  vi.unstubAllGlobals();
});
const variables = { conversationId: 42, content: "第一条" };
async function sendFirst(content = variables.content) {
  await act(async () => controller.setMessage(content));
  await act(async () =>
    controller.handleSendMessage({ preventDefault: vi.fn() } as any)
  );
}
it("drops configuration results and errors arriving after a conversation switch", async () => {
  const { productFixture } =
    await import("../../../../server/testProductConfig");
  for (const reject of [false, true]) {
    mock.productReady = false;
    let resolve!: (value: unknown) => void;
    let fail!: (error: Error) => void;
    mock.productFetch.mockReturnValue(
      new Promise((yes, no) => {
        resolve = yes;
        fail = no;
      })
    );
    await render();
    await sendFirst("发一张自拍");
    mock.conversationId = String(Number(mock.conversationId) + 1);
    await render();
    await act(async () => {
      if (reject) fail(new Error("late config error"));
      else resolve(productFixture);
    });
    expect(mock.send).not.toHaveBeenCalled();
    expect(mock.streamSubmit).not.toHaveBeenCalled();
    expect(mock.error).not.toHaveBeenCalled();
    expect(controller.failedMessages).toHaveLength(0);
  }
});
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
it("does not interrupt history reading when messages arrive or a reply completes", async () => {
  const scroll = vi.fn();
  controller.messagesEndRef.current = { scrollIntoView: scroll } as any;
  controller.messageListRef.current = document.createElement("div");
  await act(async () => vi.runOnlyPendingTimers());
  scroll.mockClear();
  mock.history = [{ id: 12, role: "assistant", content: "新回复" }];
  await render();
  await act(async () => {
    await mock.options.stream.onComplete(
      { status: "succeeded", assistantMessage: { id: 12, content: "新回复" } },
      { content: "之前发送的消息" }
    );
    await vi.runOnlyPendingTimersAsync();
  });
  expect(scroll).not.toHaveBeenCalled();
});

it.each([false, true])(
  "加载更早消息时只补偿一次高度，兼容浏览器自动锚定=%s",
  async nativeAnchoring => {
    const viewport = document.createElement("div");
    let height = 1200;
    Object.defineProperty(viewport, "scrollHeight", { get: () => height });
    viewport.scrollTop = 120;
    controller.messageListRef.current = viewport;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    mock.fetchNextPage.mockImplementation(async () => {
      height += 900;
      if (nativeAnchoring) viewport.scrollTop += 900;
    });
    await act(async () => controller.loadOlderMessages());
    expect(viewport.scrollTop).toBe(1020);
  }
);

it("加载历史期间切换会话后，不再调整旧阅读区域", async () => {
  const viewport = document.createElement("div");
  viewport.scrollTop = 120;
  controller.messageListRef.current = viewport;
  let finish!: () => void;
  mock.fetchNextPage.mockReturnValueOnce(new Promise<void>(r => (finish = r)));
  const requestFrame = vi.fn();
  vi.stubGlobal("requestAnimationFrame", requestFrame);
  const loading = controller.loadOlderMessages();
  mock.conversationId = "43";
  await render();
  finish();
  await loading;
  expect(requestFrame).not.toHaveBeenCalled();
});

it("流式历史快照不在分页记录前插入未加载的旧轮次", async () => {
  const item = (id: number) => ({
    id,
    content: `消息 ${id}`,
    createdAt: new Date().toISOString(),
  });
  const oldTurn = {
    status: "succeeded",
    userMessage: item(1),
    assistantMessage: item(2),
  };
  mock.history = [{ ...item(100), createdAt: new Date() }];
  mock.streamTurns = [
    oldTurn,
    { status: "running", userMessage: item(101), assistantMessage: item(102) },
    {
      status: "succeeded",
      userMessage: item(103),
      assistantMessage: item(104),
    },
  ];
  await render();
  expect(controller.chatMessages.map(item => item.id)).toEqual([
    100, 101, 102, 103, 104,
  ]);
  mock.history = [
    { ...item(1), createdAt: new Date() },
    { ...item(100), createdAt: new Date() },
  ];
  await render();
  expect(controller.chatMessages.map(item => item.id)).toEqual([
    1, 2, 100, 101, 102, 103, 104,
  ]);
});
it("scrolls on send and cancels delayed scrolling after switching conversations", async () => {
  const scroll = vi.fn();
  controller.messagesEndRef.current = { scrollIntoView: scroll } as any;
  controller.messageListRef.current = document.createElement("div");
  await sendFirst();
  await act(async () => vi.runOnlyPendingTimers());
  expect(scroll).toHaveBeenCalledOnce();
  scroll.mockClear();
  await sendFirst("下一条");
  mock.conversationId = "43";
  await render();
  await act(async () => vi.runOnlyPendingTimers());
  expect(scroll).not.toHaveBeenCalled();
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
it("passes the complete current composer text to image generation", async () => {
  const userContext =
    "画面细节。".repeat(250) + "\n海边侧面全身照，不看镜头，不拿手机";
  await act(async () => controller.setMessage(userContext));
  await act(async () => controller.handleSelectPose("sweet_smile", "text"));
  expect(mock.selfie).toHaveBeenCalledWith({
    conversationId: expect.any(Number),
    userContext,
    poseId: "sweet_smile",
    generationMode: "text",
  });
});

async function prepareVoiceRead() {
  mock.duration = 2;
  mock.stopRecording.mockResolvedValue({
    blob: new Blob(["private voice"]),
    mimeType: "audio/webm",
  });
  await render();
  await act(async () => {
    await controller.startRecording();
  });
  await act(async () => {
    await controller.handleRecordingComplete();
  });
  expect(readers).toHaveLength(1);
  readers[0].result = "data:audio/webm;base64,cHJpdmF0ZSB2b2ljZQ==";
  return readers[0];
}
async function leaveVoiceScope(mode: string) {
  if (mode === "account") mock.userId = "other-account";
  else if (mode === "conversation") mock.conversationId = "43";
  else {
    await unmount();
    unmount = async () => {};
    return;
  }
  await render();
}

it("previews a recording without sending or replacing the text draft, then confirms once", async () => {
  await act(async () => controller.setMessage("原来的文字草稿"));
  const reader = await prepareVoiceRead();
  await act(async () => reader.onloadend?.());
  const callbacks = mock.transcribe.mock.calls[0][1];
  const response = {
    text: "当前会话语音",
    transcriptionId: crypto.randomUUID(),
  };
  await act(async () => {
    callbacks.onSuccess(response);
    callbacks.onSuccess(response);
  });
  expect(mock.streamSubmit).not.toHaveBeenCalled();
  expect(controller.voicePreview?.text).toBe(response.text);
  expect(controller.message).toBe("原来的文字草稿");
  await act(async () => {
    controller.sendVoicePreview();
    controller.sendVoicePreview();
  });
  expect(mock.streamSubmit).toHaveBeenCalledOnce();
  expect(mock.streamSubmit).toHaveBeenCalledWith({
    content: response.text,
    transcriptionId: response.transcriptionId,
    replyWithVoice: true,
  });
  expect(controller.voicePreview).toBeNull();
  expect(controller.message).toBe("原来的文字草稿");
});

async function previewVoice(text = "语音原文") {
  const reader = await prepareVoiceRead();
  await act(async () => reader.onloadend?.());
  const transcriptionId = crypto.randomUUID();
  await act(async () =>
    mock.transcribe.mock.calls[0][1].onSuccess({ text, transcriptionId })
  );
  return transcriptionId;
}

it("sends corrected transcription as text without reusing an original-text credential", async () => {
  await previewVoice();
  await act(async () => controller.updateVoicePreview("修正后的文字"));
  await act(async () => controller.sendVoicePreview());
  expect(mock.streamSubmit).toHaveBeenCalledWith({
    content: "修正后的文字",
    replyWithVoice: true,
  });
  await act(async () =>
    mock.options.stream.onComplete(
      {
        status: "succeeded",
        assistantMessage: { content: "仍然用语音回应", id: 99 },
      },
      { content: "修正后的文字", replyWithVoice: true }
    )
  );
  expect(mock.speak).toHaveBeenCalledWith("仍然用语音回应", 99);
});

it("cancels a transcript and restores the untouched draft without a message request", async () => {
  await act(async () => controller.setMessage("还没发的草稿"));
  await previewVoice();
  await act(async () => controller.discardVoicePreview());
  expect(controller.voicePreview).toBeNull();
  expect(controller.message).toBe("还没发的草稿");
  expect(mock.streamSubmit).not.toHaveBeenCalled();
  expect(mock.send).not.toHaveBeenCalled();
});

it("keeps voice reply metadata local when a configuration failure is retried", async () => {
  await previewVoice();
  await act(async () => controller.updateVoicePreview("修正的语音内容"));
  mock.productReady = false;
  mock.productFetch.mockRejectedValueOnce(new Error("configuration offline"));
  await render();
  await act(async () => controller.sendVoicePreview());
  const failed = controller.failedMessages[0];
  expect(failed.replyWithVoice).toBe(true);
  await act(async () => controller.retryMessage(failed));
  const sent = mock.send.mock.calls[0][0];
  expect(sent.content).toBe("修正的语音内容");
  expect(sent).not.toHaveProperty("replyWithVoice");
  expect(sent.transcriptionId).toBeUndefined();
});

it.each(["conversation", "account"])(
  "does not submit a preview or its stale handlers after changing %s",
  async mode => {
    await previewVoice();
    const send = controller.sendVoicePreview;
    const edit = controller.updateVoicePreview;
    await leaveVoiceScope(mode);
    expect(controller.voicePreview).toBeNull();
    await act(async () => {
      send();
      edit("旧账号的内容");
    });
    expect(controller.voicePreview).toBeNull();
    expect(mock.streamSubmit).not.toHaveBeenCalled();
  }
);

it("appends suggestions and quoted lines without sending or overwriting an existing draft", async () => {
  await act(async () => controller.setMessage("已经写了一半"));
  await act(async () => controller.insertChatDraft("聊聊今天"));
  expect(controller.message).toBe("已经写了一半\n聊聊今天");
  await act(async () => controller.quoteMessage("第一行\n第二行", "小雨"));
  expect(controller.message).toBe(
    "> 小雨\n> 第一行\n> 第二行\n\n已经写了一半\n聊聊今天"
  );
  expect(mock.streamSubmit).not.toHaveBeenCalled();
});

it("keeps draft suggestions usable when a microphone request finishes without recording", async () => {
  await act(async () => controller.startRecording());
  await act(async () => controller.insertChatDraft("仍然可以聊聊今天"));
  expect(controller.message).toBe("仍然可以聊聊今天");
  expect(mock.streamSubmit).not.toHaveBeenCalled();
});

it("replaces the selected quote, keeps the reply, and appends shortcuts to the reply", async () => {
  await act(async () => controller.setMessage("本次想说的话"));
  await act(async () => controller.quoteMessage("第一条原文", "夏末"));
  await act(async () => controller.quoteMessage("另一条原文", "小雨"));
  await act(async () => controller.insertChatDraft("补充一句"));
  expect(controller.message).toBe(
    "> 小雨\n> 另一条原文\n\n本次想说的话\n补充一句"
  );
  expect(mock.streamSubmit).not.toHaveBeenCalled();
});

it("does not send a selected quote until there is a reply", async () => {
  await act(async () => controller.quoteMessage("引用原文", "夏末"));
  await act(async () =>
    controller.handleSendMessage({ preventDefault: vi.fn() } as any)
  );
  expect(mock.streamSubmit).not.toHaveBeenCalled();
  expect(controller.message).toBe("> 夏末\n> 引用原文\n\n");
});

it("blocks draft suggestions during a voice preview and leaves oversized drafts intact", async () => {
  await act(async () => controller.setMessage("保留草稿"));
  await previewVoice();
  await act(async () => controller.insertChatDraft("新话题"));
  expect(controller.message).toBe("保留草稿");
  await act(async () => controller.discardVoicePreview());
  await act(async () =>
    controller.insertChatDraft("太长了".repeat(controller.maxMessageLength!))
  );
  expect(controller.message).toBe("保留草稿");
  expect(mock.info).toHaveBeenLastCalledWith("chat:draftTooLong");
});

it("keeps empty or oversized voice previews editable until valid confirmation", async () => {
  await previewVoice();
  await act(async () => controller.updateVoicePreview(" "));
  await act(async () => controller.sendVoicePreview());
  expect(controller.voicePreview).not.toBeNull();
  await act(async () =>
    controller.updateVoicePreview("字".repeat(controller.maxMessageLength! + 1))
  );
  await act(async () => controller.sendVoicePreview());
  expect(controller.voicePreview).not.toBeNull();
  expect(mock.streamSubmit).not.toHaveBeenCalled();
});
it("waits for an earlier microphone request to settle before starting in a new scope", async () => {
  let finish!: () => void;
  mock.startRecording.mockReturnValueOnce(
    new Promise<void>(resolve => {
      finish = resolve;
    })
  );
  let operation!: Promise<void>;
  await act(async () => {
    operation = controller.startRecording();
  });
  mock.conversationId = "43";
  await render();
  await act(async () => {
    await controller.startRecording();
  });
  expect(mock.startRecording).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish();
    await operation;
  });
  expect(mock.cancelRecording).toHaveBeenCalled();
  await act(async () => {
    await controller.startRecording();
  });
  expect(mock.startRecording).toHaveBeenCalledTimes(2);
});

it.each(["conversation", "account", "unmount"])(
  "drops late transcription callbacks after %s",
  async mode => {
    const reader = await prepareVoiceRead();
    await act(async () => reader.onloadend?.());
    expect(mock.transcribe).toHaveBeenCalledOnce();
    const callbacks = mock.transcribe.mock.calls[0][1];
    await leaveVoiceScope(mode);
    const stateUpdates = mock.setIsTranscribing.mock.calls.length;
    await act(async () => {
      callbacks.onSuccess({
        text: "A 的私密语音",
        transcriptionId: crypto.randomUUID(),
      });
      callbacks.onError({ message: "late error" });
    });
    expect(mock.streamSubmit).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
    expect(mock.setIsTranscribing).toHaveBeenCalledTimes(stateUpdates);
    expect(mock.error).not.toHaveBeenCalled();
  }
);
it.each(["conversation", "account", "unmount"])(
  "drops late voice FileReader results after %s",
  async mode => {
    const reader = await prepareVoiceRead();
    await leaveVoiceScope(mode);
    await act(async () => {
      reader.onloadend?.();
      reader.onerror?.();
    });
    expect(mock.transcribe).not.toHaveBeenCalled();
    expect(mock.streamSubmit).not.toHaveBeenCalled();
    expect(mock.error).not.toHaveBeenCalled();
  }
);
it.each(["conversation", "account", "unmount"])(
  "drops late private photo FileReader callbacks after %s",
  async mode => {
    await act(async () =>
      controller.handleCouplePhoto(
        new File(["private"], "private.png", { type: "image/png" })
      )
    );
    const reader = readers[0];
    reader.result = "data:image/png;base64,cHJpdmF0ZQ==";
    await leaveVoiceScope(mode);
    await act(async () => {
      await reader.onload?.();
      reader.onerror?.();
    });
    expect(mock.couple).not.toHaveBeenCalled();
    expect(mock.streamStop).not.toHaveBeenCalled();
    expect(mock.error).not.toHaveBeenCalled();
  }
);
it("drops an old recorder completion closure invoked only after changing conversation", async () => {
  mock.duration = 2;
  await render();
  await act(async () => {
    await controller.startRecording();
  });
  const complete = controller.handleRecordingComplete;
  mock.conversationId = "43";
  await render();
  await act(async () => {
    await complete();
  });
  expect(mock.stopRecording).not.toHaveBeenCalled();
  expect(readers).toHaveLength(0);
  expect(mock.transcribe).not.toHaveBeenCalled();
});
it("does not dispatch media after a pending stop returns in another conversation", async () => {
  let finish!: (value: boolean) => void;
  mock.streamStop.mockReturnValue(
    new Promise(resolve => {
      finish = resolve;
    })
  );
  let operation!: Promise<void>;
  await act(async () => {
    operation = controller.handleSelectPose("casual", "reference");
  });
  mock.conversationId = "43";
  await render();
  await act(async () => {
    finish(true);
    await operation;
  });
  expect(mock.selfie).not.toHaveBeenCalled();
});
it("discards recording bytes resolved after changing account", async () => {
  mock.duration = 2;
  await render();
  await act(async () => {
    await controller.startRecording();
  });
  let finish!: (value: unknown) => void;
  mock.stopRecording.mockReturnValue(
    new Promise(resolve => {
      finish = resolve;
    })
  );
  let operation!: Promise<void>;
  await act(async () => {
    operation = controller.handleRecordingComplete();
  });
  mock.userId = "other-account";
  await render();
  await act(async () => {
    finish({ blob: new Blob(["private"]), mimeType: "audio/webm" });
    await operation;
  });
  expect(readers).toHaveLength(0);
  expect(mock.transcribe).not.toHaveBeenCalled();
});
