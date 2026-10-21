import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
type Outputs = inferRouterOutputs<AppRouter>;
export type ProductDraft = Outputs["productConfig"]["admin"]["getDraft"];
export type DiscoveryDraft = Outputs["discovery"]["admin"]["getDraft"];
export type WorkspaceOperations = {
  busy: boolean;
  run: <T>(work: () => Promise<T>) => Promise<T>;
};
