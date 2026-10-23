// @vitest-environment jsdom
/** 使用真实 wouter/history 验证详情层级、原生返回与分享链接关闭。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCharacterPreview } from "./useCharacterPreview";
import { hasAppBackEntry, trackAppHistory } from "@/lib/app-history";
vi.mock("@/features/discovery/useDiscovery", () => ({
  useDiscovery: () => ({
    data: { characters: [{ id: "rin" }, { id: "xiaotao" }] },
  }),
}));
let root: Root;
let node: HTMLDivElement;
let stop: () => void;
let preview: ReturnType<typeof useCharacterPreview>;
function Probe() {
  preview = useCharacterPreview();
  return <div>{preview.selected?.id}</div>;
}
async function pop(action: () => void) {
  await act(async () => {
    await new Promise<void>(resolve => {
      window.addEventListener("popstate", () => resolve(), { once: true });
      action();
    });
  });
}
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  history.replaceState(null, "", "/");
  stop = trackAppHistory();
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root.render(<Probe />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  stop();
  node.remove();
  vi.restoreAllMocks();
});
it("native back closes details, retains filters and scroll, then returns home; forward reopens", async () => {
  const catalogue = "/explore?q=curator&style=realistic&page=2";
  await act(async () => history.pushState({ retained: 9 }, "", catalogue));
  node.scrollTop = 360;
  const trigger = document.createElement("button");
  await act(async () => preview.showCharacter("rin", trigger));
  expect(location.pathname + location.search).toBe(
    catalogue + "&character=rin"
  );
  expect(history.state["yumei:history-index"]).toBe(2);
  expect(preview.selected?.id).toBe("rin");
  expect(preview.returnFocus.current).toBe(trigger);
  await pop(() => history.back());
  expect(location.pathname + location.search).toBe(catalogue);
  expect(history.state.retained).toBe(9);
  expect(preview.selected).toBeUndefined();
  expect(node.scrollTop).toBe(360);
  expect(hasAppBackEntry()).toBe(true);
  await pop(() => history.forward());
  expect(preview.selected?.id).toBe("rin");
  await pop(() => preview.closeCharacter());
  expect(location.pathname + location.search).toBe(catalogue);
  await pop(() => history.back());
  expect(location.pathname + location.search).toBe("/");
  expect(hasAppBackEntry()).toBe(false);
});
it("switches characters within one preview entry and closes with one back", async () => {
  await act(async () => history.pushState(null, "", "/explore"));
  const trigger = document.createElement("button");
  await act(async () => preview.showCharacter("rin", trigger));
  const length = history.length;
  await act(async () => preview.showCharacter("xiaotao"));
  expect(history.length).toBe(length);
  expect(history.state["yumei:history-index"]).toBe(2);
  expect(preview.returnFocus.current).toBe(trigger);
  await pop(() => preview.closeCharacter());
  expect(location.pathname + location.search).toBe("/explore");
});
it("closes a direct shared link in place and preserves search, style, and page", async () => {
  await act(async () =>
    history.replaceState(
      null,
      "",
      "/explore?q=rin&style=realistic&page=2&character=rin"
    )
  );
  const back = vi.spyOn(history, "back");
  const length = history.length;
  await act(async () => preview.showCharacter("xiaotao"));
  await act(async () => preview.closeCharacter());
  expect(back).not.toHaveBeenCalled();
  expect(history.length).toBe(length);
  expect(location.pathname + location.search).toBe(
    "/explore?q=rin&style=realistic&page=2"
  );
  expect(hasAppBackEntry()).toBe(false);
});
it("ignores a stale preview marker from a different URL", async () => {
  await act(async () =>
    history.replaceState(
      {
        "yumei:character-preview": {
          baseUrl: "/explore",
          detailUrl: "/explore?character=rin",
        },
      },
      "",
      "/explore?q=other&character=rin"
    )
  );
  const back = vi.spyOn(history, "back");
  await act(async () => preview.closeCharacter());
  expect(back).not.toHaveBeenCalled();
  expect(location.search).toBe("?q=other");
});
