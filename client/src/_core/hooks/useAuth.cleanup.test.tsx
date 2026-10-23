// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { formDraftKey, writeFormDraft, readFormDraft } from "@/lib/formDrafts";
import { chatInputDraftKey } from "@/lib/chatStreamDrafts";
const mock = vi.hoisted(() => ({ setMe: vi.fn(), logout: vi.fn() }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ auth: { me: { setData: mock.setMe } } }),
    auth: {
      me: {
        useQuery: () => ({ data: { id: "cleanup-user" }, isLoading: false }),
      },
      logout: {
        useMutation: () => ({ mutateAsync: mock.logout, isPending: false }),
      },
    },
  },
}));
it("clears private query data and drafts after account removal without depending on another server request", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const client = new QueryClient(),
    key = formDraftKey("cleanup-user", "support-new");
  client.setQueryData(["private-messages"], {
    content: "Private conversation",
  });
  writeFormDraft(key, { content: "Unsent support request" });
  sessionStorage.setItem(
    chatInputDraftKey("cleanup-user", 1)!,
    "Private draft"
  );
  let state!: ReturnType<typeof useAuth>;
  function Probe() {
    state = useAuth();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>
    )
  );
  await act(async () => state.clearLocalSession());
  expect(client.getQueryData(["private-messages"])).toBeUndefined();
  expect(readFormDraft(key)).toBeNull();
  expect(
    sessionStorage.getItem(chatInputDraftKey("cleanup-user", 1)!)
  ).toBeNull();
  expect(mock.setMe).toHaveBeenCalledWith(undefined, null);
  expect(mock.logout).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  client.clear();
});
