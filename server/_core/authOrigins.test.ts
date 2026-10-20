/** 覆盖本机 Docker 登录可信来源。 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveBaseURL } from "better-auth";
import {
  getAuthOriginOptions,
  getLocalAccessHosts,
  getTrustedAuthOrigins,
} from "./authOrigins";

vi.mock("node:os", () => ({
  hostname: () => "Dev-Mac.local",
  networkInterfaces: () => ({
    en0: [
      { address: "192.168.0.38", family: "IPv4", internal: false },
      { address: "10.0.0.5", family: "IPv4", internal: false },
      { address: "172.20.0.2", family: "IPv4", internal: false },
      { address: "198.18.0.1", family: "IPv4", internal: false },
      { address: "203.0.113.10", family: "IPv4", internal: false },
      { address: "fe80::1", family: "IPv6", internal: false },
    ],
  }),
}));
afterEach(() => vi.unstubAllEnvs());

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

describe("local network access", () => {
  it("allows exact loopback, machine names and local interface addresses", () => {
    vi.stubEnv("VITE_EXTRA_ALLOWED_HOST", " yumei.home, test.lan ");
    const hosts = getLocalAccessHosts();
    expect(hosts).toEqual(
      expect.arrayContaining([
        "localhost",
        "127.0.0.1",
        "[::1]",
        "dev-mac.local",
        "dev-mac",
        "192.168.0.38",
        "10.0.0.5",
        "172.20.0.2",
        "yumei.home",
        "test.lan",
      ])
    );
    for (const host of ["*", "198.18.0.1", "203.0.113.10", "fe80::1"])
      expect(hosts).not.toContain(host);
  });
  it.each(["*", "*.local", "http://dev.local", "dev.local:3000"])(
    "rejects an invalid additional hostname %s",
    host => {
      vi.stubEnv("VITE_EXTRA_ALLOWED_HOST", host);
      expect(() => getLocalAccessHosts()).toThrow("VITE_EXTRA_ALLOWED_HOST");
    }
  );
  it.each(["localhost", "127.0.0.1", "192.168.0.38", "dev-mac.local"])(
    "resolves authentication URLs on %s:3000",
    host => {
      const options = getAuthOriginOptions("http://localhost:3000", true);
      const origin = `http://${host}:3000`;
      expect(
        resolveBaseURL(options.baseURL, "/api/auth", new Request(origin))
      ).toBe(`${origin}/api/auth`);
      expect(options.trustedOrigins).toContain(origin);
      expect(options.trustedOrigins).not.toContain("http://evil.example:3000");
    }
  );
  it("preserves the configured public port for local Docker aliases", () => {
    const options = getAuthOriginOptions("http://localhost:8080", true);
    expect(options.trustedOrigins).toContain("http://127.0.0.1:8080");
    expect(options.trustedOrigins).not.toContain("http://127.0.0.1:3000");
  });
  it("keeps hosted deployments restricted to their configured origin", () => {
    vi.stubEnv("VITE_EXTRA_ALLOWED_HOST", "dev.local");
    expect(getAuthOriginOptions("https://yumei.example.com", false)).toEqual({
      baseURL: "https://yumei.example.com",
      trustedOrigins: ["https://yumei.example.com"],
    });
  });
});
