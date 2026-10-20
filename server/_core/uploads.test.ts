/** 校验上传解码的填充、无填充与非规范编码边界。 */
import { expect, it } from "vitest";
import { decodeBase64Upload } from "./uploads";

it.each(["Zg==", "Zg", "Zm8=", "Zm8", "Zm9v"])(
  "accepts valid Base64 %s",
  value => {
    expect(decodeBase64Upload(value)).toEqual(Buffer.from(value, "base64"));
  }
);
it.each([
  "",
  "!!!!",
  "====",
  "Z",
  "Zg=",
  "Zh==",
  "Zg===",
  "Zg==junk",
  "Zg==\n",
])("rejects invalid Base64 %s", value => {
  expect(() => decodeBase64Upload(value)).toThrow(
    expect.objectContaining({ code: "BAD_REQUEST" })
  );
});
