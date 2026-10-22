/** 设置页所用的供应商返回类型，以真实路由输出为准。 */
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";

type Outputs = inferRouterOutputs<AppRouter>;
export type ApiConfig = Outputs["apiConfig"]["get"] | undefined;
export type ModelInfo = Outputs["apiConfig"]["listModels"]["models"][number];
export type ElevenLabsVoice =
  Outputs["apiConfig"]["listElevenLabsVoices"]["voices"][number];
export type FishAudioModel =
  Outputs["apiConfig"]["listFishAudioModels"]["models"][number];
export type { TTSProvider } from "@shared/ttsProviders";
