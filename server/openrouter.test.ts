/** 覆盖OpenRouter 模型接口及服务端凭据解析。 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import type { ApiConfig } from "../drizzle/schema";
import * as db from "./db";
import * as chatProviders from "./_core/chatProvider";
import { keyProvider } from "./_core/keyProvider";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

const user: NonNullable<TrpcContext["user"]> = {
  id: "openrouter-test-user",
  email: "openrouter@example.com",
  emailVerified: true,
  name: "Test User",
  image: null,
  role: "user",
  birthDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};
const caller = appRouter.createCaller({
  user,
  req: {} as TrpcContext["req"],
  res: {} as TrpcContext["res"],
});

beforeEach(() => {
  vi.spyOn(chatProviders, "resolveChatProvider").mockResolvedValue({
    name: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    apiKey: "operator-test-key",
  });
});
afterEach(() => vi.restoreAllMocks());

describe("OpenRouter API integration", () => {
  it("stores model preferences without forwarding deprecated key fields", async () => {
    const saved: ApiConfig = {
      id: 1,
      userId: user.id,
      llmModel: "openai/gpt-4o-mini",
      ttsProvider: "browser",
      elevenlabsVoiceId: null,
      elevenlabsVoiceName: null,
      fishAudioModelId: null,
      fishAudioModelName: null,
      globalPrompt: null,
      replyLanguage: null,
      replyLengthLimit: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const save = vi.spyOn(db, "upsertApiConfig").mockResolvedValue(saved);
    const input = { llmModel: saved.llmModel!, llmApiKey: "deprecated-secret" };
    expect(await caller.apiConfig.updatePreferences(input)).toEqual(saved);
    expect(save).toHaveBeenCalledWith({
      userId: user.id,
      llmModel: input.llmModel,
    });
  });

  it("lists text models using the server-resolved key", async () => {
    const get = vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        data: [
          {
            id: "openai/text",
            name: "Text",
            context_length: 8192,
            architecture: {
              input_modalities: ["text"],
              output_modalities: ["text"],
            },
          },
          {
            id: "image/model",
            architecture: {
              input_modalities: ["text"],
              output_modalities: ["image"],
            },
          },
        ],
      },
    });
    const result = await caller.apiConfig.listModels();
    expect(result).toEqual({
      models: [
        {
          id: "openai/text",
          name: "Text",
          contextLength: 8192,
          pricing: { prompt: "0", completion: "0" },
          provider: "openai",
        },
      ],
      total: 1,
    });
    expect(get).toHaveBeenCalledWith("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: "Bearer operator-test-key" },
    });
  });

  it("reports an invalid operator key without exposing its value", async () => {
    vi.spyOn(axios, "get").mockRejectedValue({ response: { status: 401 } });
    await expect(caller.apiConfig.listModels()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "OpenRouter key invalid",
    });
  });

  it("rejects an empty user key before storage", async () => {
    const save = vi
      .spyOn(keyProvider, "setUserKey")
      .mockResolvedValue(undefined);
    await expect(
      caller.apiConfig.setKey({ name: "openrouter", value: "" })
    ).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects a malformed OpenRouter key before storage", async () => {
    const save = vi
      .spyOn(keyProvider, "setUserKey")
      .mockResolvedValue(undefined);
    await expect(
      caller.apiConfig.setKey({
        name: "openrouter",
        value: "invalid-key-format",
      })
    ).rejects.toThrow("OpenRouter keys start with");
    expect(save).not.toHaveBeenCalled();
  });

  it("reports a missing server key before making an upstream request", async () => {
    vi.mocked(chatProviders.resolveChatProvider).mockResolvedValue({
      name: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      apiKey: null,
    });
    const get = vi.spyOn(axios, "get");
    await expect(caller.apiConfig.listModels()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(get).not.toHaveBeenCalled();
  });
});
