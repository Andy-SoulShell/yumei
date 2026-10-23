import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
export type SavedMemory =
  inferRouterOutputs<AppRouter>["memory"]["list"][number];
export type MemoryAction =
  | { type: "edit"; memory: SavedMemory; content: string }
  | { type: "delete"; memory: SavedMemory }
  | { type: "clear" }
  | { type: "setPinned"; id: number; pinned: boolean }
  | { type: "setEnabled"; enabled: boolean }
  | { type: "setTimeZone"; timeZone: string };
export type MemoryFeedback = {
  action: MemoryAction;
  status: "saving" | "success" | "error";
  conflict?: boolean;
  refreshFailed?: boolean;
};
