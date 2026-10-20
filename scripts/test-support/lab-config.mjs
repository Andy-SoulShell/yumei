/** 隔离验收环境的固定边界；绝不读取应用 .env 或继承供应商凭据。 */
import process from "node:process";
import { readFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { parse } from "dotenv";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const LAB_DIR = path.join(ROOT, "tmp", "service-lab");
export const DATABASE = "yumei_live_lab_test";
// 使用另一回环地址，避免与真实测试 localhost:3000 共享登录 Cookie。
export const APP_ORIGIN = "http://127.0.0.2:3100";
export const FIXTURE_ORIGIN = "http://127.0.0.1:3299";
export const QA_KEYS = Object.freeze({
  whisper: "sk-yumei-qa-whisper-protocol-only",
  elevenlabs: "yumei-qa-elevenlabs-protocol-only",
  fish: "yumei-qa-fish-protocol-only",
  chat: "sk-or-v1-yumei-qa-chat-protocol-only",
});
export const WEBHOOK_SECRET = "yumei-qa-lemon-webhook-synthetic-only";
export const DATABASE_GRANT = DATABASE.replaceAll("_", "\\_");

/** 拒绝全局、其他库、角色与转授权权限；数据库下划线必须按字面转义。 */
export function assertLabGrants(grants) {
  const allowed = new Set([
    "GRANT USAGE ON *.*",
    `GRANT ALL PRIVILEGES ON \`${DATABASE_GRANT}\`.*`,
  ]);
  let databaseGrant = false;
  for (const grant of grants) {
    const parts = grant.split(" TO ");
    if (
      parts.length !== 2 ||
      parts[1] !== "`yumei_service_lab`@`%`" ||
      !allowed.has(parts[0])
    )
      throw new Error(
        "Lab database user has privileges outside its isolated database"
      );
    if (parts[0].includes(`\`${DATABASE_GRANT}\``)) databaseGrant = true;
  }
  if (!databaseGrant) throw new Error("Lab database grant is missing");
}

/** 限定数据库名称及地址；不接受通用 DATABASE_URL 环境覆盖。 */
export function assertLabDatabase(uri) {
  const url = new URL(uri);
  if (
    url.protocol !== "mysql:" ||
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
    decodeURIComponent(url.pathname.slice(1)) !== DATABASE
  )
    throw new Error(
      "Lab requires the fixed local yumei_live_lab_test database"
    );
  return url;
}

/** 从专用测试配置获取本机数据库连接，生成本次 lab 独立的会话与加密密钥。 */
export async function buildLabEnvironment(vapid) {
  const local = parse(await readFile(path.join(ROOT, ".env.test.local")));
  const source = new URL(local.DATABASE_URL);
  if (!source.pathname.toLowerCase().includes("test"))
    throw new Error("Only a dedicated test database configuration is allowed");
  source.pathname = `/${DATABASE}`;
  source.username = "yumei_service_lab";
  source.password = randomBytes(24).toString("hex");
  assertLabDatabase(source.href);
  const env = {};
  for (const name of [
    "PATH",
    "Path",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "COMSPEC",
    "PATHEXT",
  ])
    if (process.env[name]) env[name] = process.env[name];
  Object.assign(env, {
    NODE_ENV: "production",
    TZ: "UTC",
    PORT: "3100",
    DATABASE_URL: source.href,
    JWT_SECRET: randomBytes(32).toString("hex"),
    KEY_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    BETTER_AUTH_URL: APP_ORIGIN,
    DOTENV_CONFIG_PATH: path.join(LAB_DIR, "empty.env"),
    STORAGE_DRIVER: "local",
    STORAGE_LOCAL_DIR: path.join(LAB_DIR, "uploads"),
    EMAIL_PROVIDER: "smtp",
    EMAIL_FROM: "YUMEI QA <lab@example.invalid>",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "3298",
    SMTP_USER: "qa-lab",
    SMTP_PASS: "qa-local-only",
    BILLING_PROVIDER: "lemonsqueezy",
    LEMONSQUEEZY_WEBHOOK_SECRET: WEBHOOK_SECRET,
    LEMONSQUEEZY_VARIANT_PLUS: "91001",
    LEMONSQUEEZY_VARIANT_PRO: "91002",
    LEMONSQUEEZY_CHECKOUT_PLUS: `${FIXTURE_ORIGIN}/checkout/plus`,
    LEMONSQUEEZY_CHECKOUT_PRO: `${FIXTURE_ORIGIN}/checkout/pro`,
    OPERATOR_OPENAI_KEY: QA_KEYS.whisper,
    OPERATOR_ELEVENLABS_KEY: QA_KEYS.elevenlabs,
    OPERATOR_FISH_AUDIO_KEY: QA_KEYS.fish,
    LLM_PROVIDER: "openrouter",
    OPERATOR_OPENROUTER_KEY: QA_KEYS.chat,
    OPERATOR_CHAT_BASE_URL: `${FIXTURE_ORIGIN}/chat/v1`,
    // 缩短实验超时；产品默认配置不变。
    AI_TASK_TIMEOUT_MS: "1200",
    COMPANION_MEMORY_ENABLED: "0",
    PROACTIVE_PUSH_TIMEOUT_MS: "1000",
    PROACTIVE_TICK_MS: "1000",
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_SUBJECT: "mailto:qa@example.invalid",
    YUMEI_SERVICE_LAB: "1",
  });
  return env;
}

/** 仅精确匹配 QA 专用密钥及已知供应商端点。真实 DeepSeek 永不重定向。 */
export function classifyQaRequest(rawUrl, headers = {}) {
  const url = new URL(rawUrl);
  const normalized = new Map(
    Object.entries(headers).map(([name, value]) => [
      name.toLowerCase(),
      String(value),
    ])
  );
  if (
    url.origin === "https://api.openai.com" &&
    url.pathname === "/v1/audio/transcriptions" &&
    normalized.get("authorization") === `Bearer ${QA_KEYS.whisper}`
  )
    return `/whisper${url.pathname}`;
  if (
    url.origin === "https://api.elevenlabs.io" &&
    /^\/v1\/(voices|text-to-speech\/[^/]+)$/.test(url.pathname) &&
    normalized.get("xi-api-key") === QA_KEYS.elevenlabs
  )
    return `/elevenlabs${url.pathname}${url.search}`;
  if (
    url.origin === "https://api.fish.audio" &&
    ["/model", "/v1/tts"].includes(url.pathname) &&
    normalized.get("authorization") === `Bearer ${QA_KEYS.fish}`
  )
    return `/fish${url.pathname}${url.search}`;
  return null;
}

/** 常规 HTTP 出口仅允许固定回环地址；DeepSeek 不重写且直接拒绝。 */
export function assertLabEgress(rawUrl) {
  const url = new URL(rawUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "127.0.0.2", "localhost", "[::1]"].includes(url.hostname)
  )
    throw new Error("Service lab blocked a non-local outbound request");
}
