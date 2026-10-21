/** 存储调用消费实际发布的超时和签名时长，不访问外部 S3。 */
import { afterEach, expect, it, vi } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { configured } from "./testConfiguredProduct";
import { productFixture } from "./testProductConfig";
import { initializeProductConfig } from "./repositories/productConfig";
import {
  storageDelete,
  storagePut,
  storageRead,
  s3PresignedGetUrl,
} from "./storage";
vi.mock("./_core/env", async importOriginal => {
  const original = await importOriginal<typeof import("./_core/env")>();
  return {
    ...original,
    ENV: {
      ...original.ENV,
      storageDriver: "s3",
      s3Bucket: "synthetic-bucket",
      s3Region: "us-east-1",
    },
  };
});
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://synthetic.invalid/signed"),
}));
afterEach(() => vi.restoreAllMocks());
it("applies the published policy to upload, read, delete and signed URLs", async () => {
  await initializeProductConfig();
  await configured(async ({ publish }) => {
    const config = structuredClone(productFixture);
    config.runtime.storage = {
      requestTimeoutMs: 4321,
      signedUrlTtlSeconds: 47,
    };
    await publish(config);
    const send = vi
      .spyOn(S3Client.prototype, "send")
      .mockImplementation((async () => ({
        Body: { transformToByteArray: async () => new Uint8Array([1, 2]) },
      })) as never);
    const signal = vi.spyOn(AbortSignal, "timeout");
    await storagePut("synthetic/test.png", Buffer.from([1, 2]), "image/png");
    expect(await storageRead("synthetic/test.png")).toEqual(
      Buffer.from([1, 2])
    );
    await storageDelete("synthetic/test.png");
    expect(send).toHaveBeenCalledTimes(3);
    expect(signal.mock.calls.map(([ms]) => ms)).toEqual([4321, 4321, 4321]);
    expect(send.mock.calls.every(([, options]) => !!options?.abortSignal)).toBe(
      true
    );
    await s3PresignedGetUrl("synthetic/test.png");
    expect(getSignedUrl).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      { expiresIn: 47 }
    );
  });
});
