import { expect, it } from "vitest";
import { uploadDescription } from "../shared/operationalConfig";

it.each([
  [1, "1 B"],
  [1024, "1 KiB"],
  [1536, "1536 B"],
  [1024 * 1024, "1 MiB"],
  [10 * 1024 * 1024, "10 MiB"],
  [1024 * 1024 + 1, "1048577 B"],
])(
  "describes the exact published upload limit of %i bytes",
  (maxBytes, maxSize) => {
    expect(uploadDescription({ maxBytes, mimeTypes: ["image/png"] })).toEqual({
      formats: "PNG",
      maxSize,
    });
  }
);
