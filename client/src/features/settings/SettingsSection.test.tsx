// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { Brain } from "lucide-react";
import { expect, it } from "vitest";
import { SettingsSection } from "./SettingsSection";
it("mounts only on demand, keeps hidden drafts, and exposes the expanded region", async () => {
  let mounts = 0;
  function Child() {
    const [value, change] = useState(() => {
      mounts++;
      return "draft";
    });
    return <button onClick={() => change("edited")}>{value}</button>;
  }
  function Harness() {
    const [open, change] = useState(false);
    return (
      <SettingsSection
        id="task"
        title="Task"
        description="Only this task"
        icon={Brain}
        open={open}
        onOpenChange={change}
      >
        <Child />
      </SettingsSection>
    );
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Harness />));
    expect(mounts).toBe(0);
    const toggle = container.querySelector<HTMLButtonElement>("#task-title")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await act(async () => toggle.click());
    expect(mounts).toBe(1);
    const body = container.querySelector<HTMLElement>("#task-content")!;
    expect(body.getAttribute("aria-labelledby")).toBe("task-title");
    await act(async () => body.querySelector("button")!.click());
    await act(async () => toggle.click());
    expect(body.hidden).toBe(true);
    await act(async () => toggle.click());
    expect(body.hidden).toBe(false);
    expect(body.textContent).toBe("edited");
    expect(mounts).toBe(1);
  } finally {
    await act(async () => root.unmount());
  }
});
