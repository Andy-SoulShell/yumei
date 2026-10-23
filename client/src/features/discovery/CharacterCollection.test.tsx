// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  CharacterCollectionProvider,
  useCharacterCollection,
} from "./CharacterCollection";
import { i18n, type Translator } from "@shared/i18n";
const mock = vi.hoisted(() => ({
  user: null as { id: string } | null,
  navigate: vi.fn(),
  save: vi.fn(),
  setData: vi.fn(),
  toast: vi.fn(),
  error: vi.fn(),
  data: [] as string[],
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: mock.user }),
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/explore", mock.navigate],
  useSearch: () => "q=music&style=anime",
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: i18n.getFixedT("en") as Translator }),
}));
vi.mock("sonner", () => ({
  toast: { success: mock.toast, error: mock.error },
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    discovery: {
      favorites: { useQuery: () => ({ data: mock.data, refetch: vi.fn() }) },
      setFavorite: { useMutation: () => ({ mutateAsync: mock.save }) },
    },
    useUtils: () => ({ discovery: { favorites: { setData: mock.setData } } }),
  },
}));
function Probe() {
  const c = useCharacterCollection();
  return (
    <button onClick={() => c.toggle("rin")} disabled={c.busy !== null}>
      {c.ids.join(",") || "save"}
    </button>
  );
}
let root: Root, element: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mock.user = null;
  mock.data = [];
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
});
afterEach(async () => {
  await act(() => root.unmount());
  element.remove();
});
const render = () =>
  act(() =>
    root.render(
      <CharacterCollectionProvider>
        <Probe />
      </CharacterCollectionProvider>
    )
  );
it("preserves the selected role and public filters when a visitor signs in to save", async () => {
  await render();
  await act(() => element.querySelector("button")!.click());
  const next = new URL(
    mock.navigate.mock.calls[0][0],
    "http://test"
  ).searchParams.get("next")!;
  expect(next).toContain("q=music&style=anime&character=rin");
  expect(mock.save).not.toHaveBeenCalled();
});
it("sends an explicit desired state and only updates favorites after the server confirms", async () => {
  mock.user = { id: "a" };
  mock.save.mockResolvedValue(["rin"]);
  await render();
  await act(() => element.querySelector("button")!.click());
  expect(mock.save).toHaveBeenCalledWith({ id: "rin", active: true });
  expect(mock.setData).toHaveBeenCalledWith(undefined, ["rin"]);
});
it("does not restore private query data or show stale feedback after an account switch", async () => {
  let resolve!: (value: string[]) => void;
  mock.user = { id: "a" };
  mock.save.mockReturnValue(
    new Promise<string[]>(r => {
      resolve = r;
    })
  );
  await render();
  await act(() => element.querySelector("button")!.click());
  mock.user = { id: "b" };
  await render();
  await act(() => resolve(["rin"]));
  expect(mock.setData).not.toHaveBeenCalled();
  expect(mock.toast).not.toHaveBeenCalled();
  expect(element.querySelector("button")!.disabled).toBe(false);
});
it("keeps the last confirmed collection after a failed save", async () => {
  mock.user = { id: "a" };
  mock.data = ["rin"];
  mock.save.mockRejectedValue(new Error("offline"));
  await render();
  await act(() => element.querySelector("button")!.click());
  expect(mock.save).toHaveBeenCalledWith({ id: "rin", active: false });
  expect(mock.setData).not.toHaveBeenCalled();
  expect(mock.error).toHaveBeenCalledOnce();
  expect(element.textContent).toBe("rin");
});
