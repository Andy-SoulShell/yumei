// @vitest-environment jsdom
/** 独立生成的幂等提交和账号切换回归，不调用真实图片或视频服务。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  productFixture,
  productView,
} from "../../../../server/testProductConfig";
import { i18n, type Translator } from "@shared/i18n";
import { clearFormDrafts } from "@/lib/formDrafts";
import { pendingImageSubmissions } from "@/lib/imageSubmissions";
import { MediaStudio } from "./MediaStudio";
const mock = vi.hoisted(() => ({
  user: null as { id: string } | null,
  navigate: vi.fn(),
  resume: vi.fn(),
  image: vi.fn(),
  couple: vi.fn(),
  video: vi.fn(),
  createRole: vi.fn(),
  invalidate: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: mock.user }),
}));
vi.mock("wouter", async original => ({
  ...(await original<typeof import("wouter")>()),
  useLocation: () => ["/generate", mock.navigate],
  useSearch: () => "",
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: i18n.getFixedT("en") as Translator, locale: "en" }),
}));
vi.mock("@/features/product/useProductConfig", () => ({
  useProductConfig: () => ({ raw: productFixture, data: productView }),
}));
vi.mock("@/features/discovery/useDiscovery", () => ({
  useDiscovery: () => ({ data: { characters: [] } }),
}));
vi.mock("./ImageTaskCard", () => ({
  ImageTaskCard: ({ requestId }: { requestId: string }) => (
    <p data-task={requestId}>image accepted</p>
  ),
}));
vi.mock("./VideoMessage", () => ({ VideoMessage: () => null }));
vi.mock("sonner", () => ({ toast: { success: mock.toast } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    girlfriend: {
      list: {
        useQuery: () => ({
          data: [
            {
              id: 1,
              name: "QA",
              referenceImageUrl: "/qa.jpg",
              intimacyPoints: 0,
            },
          ],
        }),
      },
      createFromPreset: {
        useMutation: () => ({ mutateAsync: mock.createRole }),
      },
    },
    conversation: {
      resume: { useMutation: () => ({ mutateAsync: mock.resume }) },
    },
    apiConfig: {
      get: {
        useQuery: () => ({
          data: {
            imageProvider: { configured: true, supportsTextToImage: true },
          },
        }),
      },
    },
    selfie: {
      quota: {
        useQuery: () => ({ data: { unlimited: true }, refetch: vi.fn() }),
      },
      createTask: { useMutation: () => ({ mutateAsync: mock.image }) },
      createCoupleTask: { useMutation: () => ({ mutateAsync: mock.couple }) },
    },
    video: { create: { useMutation: () => ({ mutateAsync: mock.video }) } },
    useUtils: () => ({
      selfie: { invalidate: mock.invalidate },
      conversation: { invalidate: mock.invalidate },
      billing: { getInfo: { invalidate: mock.invalidate } },
      girlfriend: { invalidate: mock.invalidate },
    }),
  },
}));
let root: Root, element: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  clearFormDrafts();
  vi.clearAllMocks();
  mock.user = { id: "studio-a" };
  mock.resume.mockResolvedValue({ id: 10 });
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
});
afterEach(async () => {
  await act(() => root.unmount());
  element.remove();
  clearFormDrafts();
});
const submit = () =>
  Array.from(element.querySelectorAll("button")).find(
    b => b.textContent === "Generate image"
  )!;
it("uses the same request ID after an uncertain network result and clears recovery only on acceptance", async () => {
  mock.image
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ id: "11111111-1111-4111-8111-111111111111" });
  await act(() => root.render(<MediaStudio />));
  await act(() => submit().click());
  expect(pendingImageSubmissions("studio-a")).toHaveLength(1);
  const first = mock.image.mock.calls[0][0];
  await act(() => submit().click());
  expect(mock.image.mock.calls[1][0].clientRequestId).toBe(
    first.clientRequestId
  );
  expect(pendingImageSubmissions("studio-a")).toHaveLength(0);
  expect(element.querySelector("[data-task]")).not.toBeNull();
});
it("does not send a generation request when a user switches accounts while the conversation opens", async () => {
  let resolve!: (value: { id: number }) => void;
  mock.resume.mockReturnValueOnce(
    new Promise(r => {
      resolve = r;
    })
  );
  await act(() => root.render(<MediaStudio />));
  await act(() => submit().click());
  mock.user = { id: "studio-b" };
  await act(() => root.render(<MediaStudio />));
  await act(() => resolve({ id: 10 }));
  expect(mock.image).not.toHaveBeenCalled();
  expect(pendingImageSubmissions("studio-b")).toEqual([]);
});
it("gates creation at sign-in without issuing private mutations", async () => {
  mock.user = null;
  await act(() => root.render(<MediaStudio />));
  await act(() => submit().click());
  expect(mock.navigate).toHaveBeenCalledWith(
    "/login?next=%2Fgenerate%3Fview%3Dcreate%26resume%3D1"
  );
  expect(mock.resume).not.toHaveBeenCalled();
  expect(mock.image).not.toHaveBeenCalled();
});
