// @vitest-environment jsdom
/** 验证跨分区刷新、部分保存和请求期间继续编辑均保留草稿。 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { useSettingsDraft } from "./useSettingsDraft";

it("preserves dirty fields across key refreshes and acknowledges only the submitted version", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const defaults = { prompt: "", model: "", voice: "" };
  let remote = { prompt: "saved", model: "old-model", voice: "old-voice" };
  let draft!: ReturnType<typeof useSettingsDraft<typeof defaults>>;
  function Probe() {
    draft = useSettingsDraft(defaults, remote);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<Probe />));
    await act(async () => {
      draft.field("prompt")[1]("unsaved prompt");
      draft.field("model")[1]("new-model");
    });
    remote = { ...remote, voice: "remote-voice" };
    await act(async () => root.render(<Probe />));
    expect(draft.value).toEqual({
      prompt: "unsaved prompt",
      model: "new-model",
      voice: "remote-voice",
    });
    const submitted = { ...draft.value };
    await act(async () => draft.field("model")[1]("edited-during-save"));
    await act(async () => draft.acknowledge(["model"], submitted));
    expect(draft.isDirty(["model"])).toBe(true);
    expect(draft.isDirty(["prompt"])).toBe(true);
    remote = { ...remote, model: "new-model" };
    await act(async () => root.render(<Probe />));
    expect(draft.value.model).toBe("edited-during-save");
    await act(async () => draft.acknowledge(["prompt"], { ...draft.value }));
    expect(draft.isDirty(["prompt"])).toBe(false);
    expect(draft.isDirty(["model"])).toBe(true);
  } finally {
    await act(async () => root.unmount());
  }
});

it("restores only unsaved fields per account and removes them after a successful save", async () => {
  const { formDraftKey, clearFormDrafts, readFormDraft } =
    await import("@/lib/formDrafts");
  clearFormDrafts();
  const defaults = { prompt: "", model: "" };
  let remote = { prompt: "saved", model: "server-model" };
  let key = formDraftKey("a", "settings");
  let draft!: ReturnType<typeof useSettingsDraft<typeof defaults>>;
  function Probe() {
    draft = useSettingsDraft(defaults, remote, key);
    return null;
  }
  let root = createRoot(document.createElement("div"));
  const render = () => act(async () => root.render(<Probe />));
  try {
    await render();
    await act(async () => draft.field("prompt")[1]("unsaved"));
    await act(async () => root.unmount());
    root = createRoot(document.createElement("div"));
    remote = { ...remote, model: "new-server-model" };
    await render();
    expect(draft.value).toEqual({
      prompt: "unsaved",
      model: "new-server-model",
    });
    key = formDraftKey("b", "settings");
    await render();
    expect(draft.value.prompt).toBe("saved");
    key = formDraftKey("a", "settings");
    await render();
    expect(draft.value.prompt).toBe("unsaved");
    await act(async () => draft.acknowledge(["prompt"], { ...draft.value }));
    expect(readFormDraft(key)).toBeNull();
  } finally {
    await act(async () => root.unmount());
    clearFormDrafts();
  }
});
