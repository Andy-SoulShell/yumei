/** 仅隔离 lab 进程加载的 HTTP 传输适配，不改应用路由或实际供应商接收方。 */
import process from "node:process";
import { URL, urlToHttpOptions } from "node:url";
import axios from "axios";
import https from "node:https";
import http from "node:http";
import net from "node:net";
import { syncBuiltinESMExports } from "node:module";
import {
  assertLabDatabase,
  assertLabEgress,
  classifyQaRequest,
  FIXTURE_ORIGIN,
} from "./lab-config.mjs";

if (process.env.YUMEI_SERVICE_LAB !== "1" || process.env.PORT !== "3100")
  throw new Error(
    "Service lab preload requires explicit isolated lab configuration"
  );
assertLabDatabase(process.env.DATABASE_URL);

const originalFetch = globalThis.fetch;
const { Request } = globalThis;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const target = classifyQaRequest(
    request.url,
    Object.fromEntries(request.headers)
  );
  const destination = target ? FIXTURE_ORIGIN + target : request.url;
  assertLabEgress(destination);
  if (!target) return originalFetch(request, { redirect: "manual" });
  return originalFetch(destination, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    duplex: "half",
    signal: request.signal,
    redirect: "manual",
  });
};

axios.interceptors.request.use(config => {
  const target = classifyQaRequest(config.url, config.headers.toJSON());
  if (target) config.url = FIXTURE_ORIGIN + target;
  assertLabEgress(config.url);
  // 直接禁止自动重定向，防止适配器在包装器内部跟随到公网。
  config.maxRedirects = 0;
  return config;
});

/** 合并 URL + options 两种签名，以最终 hostname 检查实际目标。 */
function effectiveOptions(input, args, protocol) {
  const fromUrl = typeof input === "string" || input instanceof URL;
  return fromUrl
    ? {
        ...urlToHttpOptions(new URL(input)),
        ...(typeof args[0] === "object" ? args[0] : {}),
      }
    : { protocol, ...input };
}

function assertRequestOptions(options) {
  const host = options.hostname || options.host || "localhost";
  const authority =
    host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  if (options.socketPath)
    throw new Error("Service lab blocked a custom socket HTTP request");
  assertLabEgress(`${options.protocol || "http:"}//${authority}/`);
}

const originalHttpRequest = http.request;
const originalHttpsRequest = https.request;
http.request = function (input, ...args) {
  assertRequestOptions(effectiveOptions(input, args, "http:"));
  return originalHttpRequest.call(this, input, ...args);
};
https.request = function (input, ...args) {
  const options = effectiveOptions(input, args, "https:");
  // 保留 web-push 的真实 ECDH 加密与 VAPID，只有该合成设备走本机 HTTP。
  if (
    options?.hostname === "push.lab.invalid" &&
    /^\/qa-push\/[a-zA-Z0-9-]+$/.test(options.path)
  )
    return originalHttpRequest(
      {
        ...options,
        hostname: "127.0.0.1",
        port: 3299,
        path: `/push${options.path}`,
        protocol: "http:",
      },
      ...(typeof args[0] === "object" ? args.slice(1) : args)
    );
  assertRequestOptions(options);
  return originalHttpsRequest.call(this, input, ...args);
};

// Node 原生 get 的内部 request 引用不经过导出对象，需显式包住。
for (const client of [http, https])
  client.get = function (input, ...args) {
    const request = client.request(input, ...args);
    request.end();
    return request;
  };

// 原入口默认监听全部网卡；lab 强制只监听另一回环地址。
const originalListen = net.Server.prototype.listen;
net.Server.prototype.listen = function (port, ...args) {
  if (port === 3100)
    return originalListen.call(this, port, "127.0.0.2", ...args);
  return originalListen.call(this, port, ...args);
};
syncBuiltinESMExports();
