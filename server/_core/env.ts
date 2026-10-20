/** 在模块加载时校验运行配置，统一导出存储、数据库和认证所需变量。 */

const NODE_ENVS = ["development", "test", "production"] as const;
/** 应用支持的运行环境标识。 */
type NodeEnv = (typeof NODE_ENVS)[number];

/** 汇总启动配置问题的错误，便于一次定位全部缺失项。 */
export class EnvValidationError extends Error {
  /** 本次配置校验发现的全部问题。 */
  readonly issues: string[];
  /** 将多项配置错误合并为可读的启动失败信息。 */
  constructor(issues: string[]) {
    super(
      "Invalid environment configuration:\n" +
        issues.map(i => `  - ${i}`).join("\n") +
        "\n\nSee .env.example for the full schema."
    );
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

/**
 * 读取进程环境并集中校验，配置不合法时阻止启动。
 *
 * @throws {@link EnvValidationError} 配置缺失、格式不符或选项不受支持时抛出。
 */
function loadEnv() {
  const issues: string[] = [];
  const env = process.env;

  for (const [name, min, max] of [
    ["AI_DAILY_TASK_LIMIT", 1, 10000],
    ["AI_TASK_TIMEOUT_MS", 100, 120000],
    ["CHAT_CONTEXT_CHAR_LIMIT", 64000, 160000],
    ["CHAT_MAX_OUTPUT_CHARS", 1000, 32000],
    ["CHAT_REPLY_TIMEOUT_MS", 5000, 300000],
    ["CHAT_STREAM_CONCURRENCY", 1, 32],
    ["CHAT_USER_CONCURRENCY", 1, 10],
    ["PROACTIVE_TICK_MS", 1000, 3600000],
    ["PROACTIVE_PUSH_TIMEOUT_MS", 100, 20000],
  ] as const) {
    if (
      env[name] &&
      (!/^\d+$/.test(env[name]!) ||
        Number(env[name]) < min ||
        Number(env[name]) > max)
    )
      issues.push(`${name}: must be an integer between ${min} and ${max}.`);
  }
  for (const name of [
    "COMPANION_MEMORY_ENABLED",
    "COMPANION_PROACTIVE_ENABLED",
  ]) {
    if (env[name] && !["0", "1"].includes(env[name]!))
      issues.push(`${name}: must be 0 or 1.`);
  }

  if (env.OPERATOR_CHAT_BASE_URL) {
    try {
      const base = new URL(env.OPERATOR_CHAT_BASE_URL);
      if (
        !["https:", "http:"].includes(base.protocol) ||
        base.username ||
        base.password ||
        base.search ||
        base.hash
      )
        throw new Error();
    } catch {
      issues.push(
        "OPERATOR_CHAT_BASE_URL: use an HTTP(S) API base URL without credentials, query or fragment."
      );
    }
  }

  if (
    env.LLM_PROVIDER &&
    !["openrouter", "deepseek"].includes(env.LLM_PROVIDER)
  ) {
    issues.push('LLM_PROVIDER: must be "openrouter" or "deepseek".');
  }

  if (env.IMAGE_PROVIDER && !["fal", "comfyui"].includes(env.IMAGE_PROVIDER)) {
    issues.push('IMAGE_PROVIDER: must be "fal" or "comfyui".');
  }
  if (env.IMAGE_PROVIDER === "comfyui") {
    try {
      const url = new URL(env.COMFYUI_BASE_URL || "");
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.search ||
        url.hash ||
        url.username ||
        url.password
      )
        throw new Error();
    } catch {
      issues.push(
        "COMFYUI_BASE_URL: required for ComfyUI; use an HTTP(S) base URL without credentials, query or fragment."
      );
    }
  }
  if (
    env.COMFYUI_TIMEOUT_MS &&
    (!/^\d+$/.test(env.COMFYUI_TIMEOUT_MS) ||
      Number(env.COMFYUI_TIMEOUT_MS) < 1000 ||
      Number(env.COMFYUI_TIMEOUT_MS) > 1_800_000)
  ) {
    issues.push(
      "COMFYUI_TIMEOUT_MS: must be an integer between 1000 and 1800000."
    );
  }

  // 所有环境均要求会话签名密钥。
  if (!env.JWT_SECRET) {
    issues.push(
      "JWT_SECRET: JWT_SECRET is required. Generate with `openssl rand -hex 32` and set it in .env."
    );
  } else if (env.JWT_SECRET.length < 32) {
    issues.push(
      "JWT_SECRET: JWT_SECRET must be at least 32 characters. Generate with `openssl rand -hex 32`."
    );
  }

  // 测试以外必须提供独立的用户密钥加密主密钥。
  if ((env.NODE_ENV ?? "development") !== "test") {
    if (!env.KEY_ENCRYPTION_KEY) {
      issues.push(
        "KEY_ENCRYPTION_KEY: KEY_ENCRYPTION_KEY is required (encrypts per-user BYOK API keys at rest). Generate with `openssl rand -hex 32` and set it in .env."
      );
    } else if (env.KEY_ENCRYPTION_KEY.length < 32) {
      issues.push(
        "KEY_ENCRYPTION_KEY: KEY_ENCRYPTION_KEY must be at least 32 characters."
      );
    } else if (env.KEY_ENCRYPTION_KEY === env.JWT_SECRET) {
      issues.push(
        "KEY_ENCRYPTION_KEY: KEY_ENCRYPTION_KEY must NOT equal JWT_SECRET. Generate two distinct secrets."
      );
    }
  }

  // 未设置时默认为开发环境；拒绝未支持的运行环境。
  const nodeEnv = (env.NODE_ENV ?? "development") as NodeEnv;
  if (!NODE_ENVS.includes(nodeEnv)) {
    issues.push(
      `NODE_ENV: NODE_ENV must be one of ${NODE_ENVS.join(", ")} (got "${env.NODE_ENV}").`
    );
  }

  // 开发和生产必须提供数据库连接；纯单元测试可省略。
  if (nodeEnv !== "test") {
    if (env.DATABASE_URL === undefined) {
      issues.push("DATABASE_URL: DATABASE_URL is required (set in .env).");
    } else if (env.DATABASE_URL === "") {
      issues.push("DATABASE_URL: DATABASE_URL must not be empty.");
    }
  }

  // 本机 Docker 可显式选择 stdout；生产真实发信必须配置邮件服务。
  if (nodeEnv === "production" && env.EMAIL_PROVIDER !== "stdout") {
    if (!env.EMAIL_FROM) {
      issues.push(
        "EMAIL_FROM: EMAIL_FROM is required in production (e.g. 'YUMEI <noreply@example.com>')."
      );
    }

    const hasResend = !!env.RESEND_API_KEY;
    const hasSmtp =
      env.EMAIL_PROVIDER === "smtp" &&
      !!env.SMTP_HOST &&
      !!env.SMTP_USER &&
      !!env.SMTP_PASS;

    if (!hasResend && !hasSmtp) {
      issues.push(
        "Email: Production requires either RESEND_API_KEY, or EMAIL_PROVIDER=smtp with SMTP_HOST + SMTP_USER + SMTP_PASS. See .env.example."
      );
    }
  }

  // local 写入磁盘，s3 使用兼容对象存储；测试默认写入临时目录。
  const storageDriver = (env.STORAGE_DRIVER ?? "local") as "local" | "s3";
  if (!["local", "s3"].includes(storageDriver)) {
    issues.push(
      `STORAGE_DRIVER: must be "local" or "s3" (got "${env.STORAGE_DRIVER}").`
    );
  }
  if (storageDriver === "s3") {
    if (!env.S3_BUCKET)
      issues.push("S3_BUCKET: required when STORAGE_DRIVER=s3.");
    if (!env.S3_REGION)
      issues.push("S3_REGION: required when STORAGE_DRIVER=s3.");
    // 静态凭据可省略，AWS 部署也可使用实例角色或工作负载身份。
  }
  const storageLocalDir =
    env.STORAGE_LOCAL_DIR ??
    (nodeEnv === "test" ? `/tmp/yumei-test-uploads` : "./data/uploads");

  // free 默认执行免费额度；none 开放自托管能力；lemonsqueezy 接入订阅。
  const billingProvider = env.BILLING_PROVIDER ?? "free";
  if (!["free", "none", "lemonsqueezy"].includes(billingProvider)) {
    issues.push(
      `BILLING_PROVIDER: must be "free", "none", or "lemonsqueezy" (got "${env.BILLING_PROVIDER}").`
    );
  }
  if (billingProvider === "lemonsqueezy" && !env.LEMONSQUEEZY_WEBHOOK_SECRET) {
    issues.push(
      "LEMONSQUEEZY_WEBHOOK_SECRET: required when BILLING_PROVIDER=lemonsqueezy (set it in the Lemon Squeezy webhook settings too)."
    );
  }

  // 登录链接和媒体 URL 共用公开地址；开发环境回退到 localhost:PORT。
  const publicUrl =
    env.BETTER_AUTH_URL ?? `http://localhost:${env.PORT || "3000"}`;
  if (nodeEnv === "production" && !env.BETTER_AUTH_URL) {
    issues.push(
      "BETTER_AUTH_URL: required in production (the public URL of this deployment, e.g. https://yumei.example.com)."
    );
  }

  if (issues.length > 0) {
    throw new EnvValidationError(issues);
  }

  return {
    cookieSecret: env.JWT_SECRET!,
    keyEncryptionKey: env.KEY_ENCRYPTION_KEY ?? "",
    databaseUrl: env.DATABASE_URL ?? "",
    isProduction: nodeEnv === "production",
    isTest: nodeEnv === "test",
    publicUrl,
    storageDriver,
    storageLocalDir,
    s3Bucket: env.S3_BUCKET ?? "",
    s3Region: env.S3_REGION ?? "",
    s3Endpoint: env.S3_ENDPOINT ?? "",
    s3AccessKeyId: env.S3_ACCESS_KEY_ID ?? "",
    s3SecretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "",
  } as const;
}

/** 模块加载时生成的配置快照，修改环境变量后需要重新加载模块或重启进程。 */
export const ENV = loadEnv();
