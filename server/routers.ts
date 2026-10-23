import { managementRouter } from "./routers/management";
import { videoRouter } from "./routers/video";
/** 业务路由组合入口；每个领域拥有独立的校验和处理过程。 */
import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { apiConfigRouter } from "./routers/apiConfig";
import { authRouter } from "./routers/auth";
import { billingRouter } from "./routers/billing";
import { chatRouter } from "./routers/chat";
import { conversationRouter } from "./routers/conversation";
import { girlfriendRouter } from "./routers/girlfriend";
import { memoryRouter } from "./routers/memory";
import { moodRouter } from "./routers/mood";
import { notificationRouter } from "./routers/notification";
import { preferencesRouter } from "./routers/preferences";
import { pushRouter } from "./routers/push";
import { selfieRouter } from "./routers/selfie";
import { ttsRouter } from "./routers/tts";
import { voiceRouter } from "./routers/voice";
import { operationsRouter } from "./routers/operations";
import { discoveryRouter } from "./routers/discovery";
import { productConfigRouter } from "./routers/productConfig";

import { privacyRouter } from "./routers/privacy";
export const appRouter = router({
  privacy: privacyRouter,
  video: videoRouter,
  management: managementRouter,
  productConfig: productConfigRouter,
  discovery: discoveryRouter,
  operations: operationsRouter,
  preferences: preferencesRouter,
  system: systemRouter,
  auth: authRouter,
  girlfriend: girlfriendRouter,
  conversation: conversationRouter,
  chat: chatRouter,
  selfie: selfieRouter,
  push: pushRouter,
  billing: billingRouter,
  memory: memoryRouter,
  apiConfig: apiConfigRouter,
  mood: moodRouter,
  notification: notificationRouter,
  tts: ttsRouter,
  voice: voiceRouter,
});

export type AppRouter = typeof appRouter;
