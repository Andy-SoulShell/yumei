/** 覆盖本机 Docker 登录可信来源。 */

import { describe, expect, it } from "vitest";
import { getTrustedAuthOrigins } from "./authOrigins";

describe("local Docker authentication origins", () => {
  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "allows loopback aliases for a configured %s origin",
    hostname => {
      expect(
        getTrustedAuthOrigins(`http://${hostname}:3000`, true).sort()
      ).toEqual(
        [
          "http://localhost:3000",
          "http://127.0.0.1:3000",
          "http://[::1]:3000",
        ].sort()
      );
    }
  );

  it("uses the public port rather than the internal Docker port", () => {
    const origins = getTrustedAuthOrigins("http://localhost:8080", true);
    expect(origins).toContain("http://127.0.0.1:8080");
    expect(origins).not.toContain("http://127.0.0.1:3000");
    expect(origins).not.toContain("https://127.0.0.1:8080");
  });

  it("keeps local aliases disabled unless explicitly requested", () => {
    expect(getTrustedAuthOrigins("http://localhost:3000")).toEqual([
      "http://localhost:3000",
    ]);
  });

  it.each(["https://yumei.example.com", "http://localhost.example.com:3000"])(
    "does not expand a hosted origin: %s",
    publicUrl => {
      expect(getTrustedAuthOrigins(publicUrl, true)).toEqual([publicUrl]);
    }
  );
});
