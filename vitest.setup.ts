/** 测试环境初始化，提供认证占位密钥、临时存储与默认自托管配置。 */

// 测试专用占位签名密钥，仅满足启动校验，不用于真实会话。
process.env.JWT_SECRET ??=
  "test-jwt-secret-not-used-for-real-signing-padded-padded-padded";
process.env.NODE_ENV ??= "test";

// 全局启动检查要求显式提供已迁移的专用 MySQL 测试库，库名须包含 test。

// 上传测试会实际写入文件，默认使用当前进程专属的临时目录。
process.env.STORAGE_DRIVER ??= "local";
process.env.STORAGE_LOCAL_DIR ??= `/tmp/yumei-test-uploads-${process.pid}`;

// 默认自托管模式，避免套餐权限影响无关用例；计费测试自行切换模式。
process.env.BILLING_PROVIDER ??= "none";
