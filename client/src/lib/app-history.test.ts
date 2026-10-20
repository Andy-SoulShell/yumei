// @vitest-environment jsdom
/** 直接访问、站内跳转、替换地址和原生返回必须保持正确的返回层级。 */
import "wouter/use-browser-location";
import { afterEach, beforeEach, expect, it } from "vitest";
import { hasAppBackEntry, trackAppHistory } from "./app-history";
let stop: () => void;
beforeEach(() => {
  history.replaceState(null, "", "/explore");
  stop = trackAppHistory();
});
afterEach(() => stop());
it("has no app back target on direct entry", () => {
  expect(hasAppBackEntry()).toBe(false);
});
it("counts internal pushes and preserves unrelated state", () => {
  history.pushState({ selection: 7 }, "", "/setup");
  expect(hasAppBackEntry()).toBe(true);
  expect(history.state.selection).toBe(7);
  expect(history.state["yumei:history-index"]).toBe(1);
});
it("does not add history for replacement routes or modal query changes", () => {
  history.replaceState(null, "", "/explore?character=xiaotao");
  expect(hasAppBackEntry()).toBe(false);
  history.pushState(null, "", "/setup");
  history.replaceState(null, "", "/setup?preset=xiaotao");
  expect(history.state["yumei:history-index"]).toBe(1);
});
it("uses the destination index after native back and starts a new branch", async () => {
  history.pushState(null, "", "/setup");
  await new Promise<void>(resolve => {
    window.addEventListener("popstate", () => resolve(), { once: true });
    history.back();
  });
  expect(hasAppBackEntry()).toBe(false);
  history.pushState(null, "", "/settings");
  expect(history.state["yumei:history-index"]).toBe(1);
});
