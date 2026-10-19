import axios from "axios";
import { beforeEach, expect, it, vi } from "vitest";
import { generateProviderImage } from "./imageProvider";
vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }));
vi.mock("./keyProvider", () => ({ keyProvider: { resolve: vi.fn() } }));
vi.mock("../storage", () => ({ storageRead: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it("uses the fal text endpoint without an image URL, asking for a single PNG", async () => {
  vi.mocked(axios.post).mockResolvedValue({
    data: { images: [{ url: "https://media.example/portrait.png" }] },
  });
  const bytes = Buffer.from([137, 80, 78, 71]);
  vi.mocked(axios.get).mockResolvedValue({ data: bytes });
  expect(
    await generateProviderImage(
      { name: "fal", apiKey: "test", isByok: true, configured: true },
      { mode: "text", references: [], prompt: "adult, black hair" }
    )
  ).toEqual(bytes);
  expect(axios.post).toHaveBeenCalledWith(
    "https://fal.run/xai/grok-imagine-image",
    {
      prompt: "adult, black hair",
      num_images: 1,
      aspect_ratio: "3:4",
      output_format: "png",
    },
    expect.anything()
  );
});
