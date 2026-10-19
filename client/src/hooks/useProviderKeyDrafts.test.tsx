// @vitest-environment jsdom
/** 使用真实 React 状态验证部分保存、重试以及保存中的再次编辑。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProviderKeyDrafts } from "./useProviderKeyDrafts";

let root: Root;
let container: HTMLDivElement;
let hook: ReturnType<typeof useProviderKeyDrafts>;
const save = vi.fn();

function Harness() {
  hook = useProviderKeyDrafts(save);
  return <output>{JSON.stringify(hook.drafts)}</output>;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  save.mockReset();
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe("key drafts", () => {
  it("clears only successful fields, retains failures, and retries just the failed input", async () => {
    save
      .mockImplementationOnce(async () => {})
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValue(undefined);
    await act(async () => {
      hook.setDraft("openrouter", "sk-or-test");
      hook.setDraft("fal", "failed-fal-secret");
    });
    await act(async () => {
      const result = await hook.saveDrafts();
      expect(result.saved).toEqual(["openrouter"]);
      expect(result.failed.map(r => r.name)).toEqual(["fal"]);
    });
    expect(hook.drafts.openrouter).toBe("");
    expect(hook.drafts.fal).toBe("failed-fal-secret");
    await act(async () => {
      expect((await hook.saveDrafts()).failed).toEqual([]);
    });
    expect(save.mock.calls.at(-1)?.[0]).toEqual({
      name: "fal",
      value: "failed-fal-secret",
    });
    expect(save).toHaveBeenCalledTimes(3);
    expect(hook.drafts.fal).toBe("");
  });

  it("keeps a new edit made while an earlier value is being saved", async () => {
    let finish!: () => void;
    save.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    await act(async () => hook.setDraft("openrouter", "old-key"));
    let request!: ReturnType<typeof hook.saveDrafts>;
    await act(async () => {
      request = hook.saveDrafts(["openrouter"]);
    });
    await act(async () => hook.setDraft("openrouter", "new-key"));
    await act(async () => {
      finish();
      await request;
    });
    expect(hook.drafts.openrouter).toBe("new-key");
    expect(save).toHaveBeenCalledTimes(1);
    expect(hook.isSaving).toBe(false);
  });
});
