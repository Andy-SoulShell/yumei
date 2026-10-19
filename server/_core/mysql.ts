/** 统一 MySQL 的日期编解码和连接会话时区，避免宿主机时区改变持久化语义。 */
import { createPool } from "mysql2/promise";

/** 创建使用 UTC 编解码和 UTC 会话的连接池；调用方负责池的生命周期。 */
export function createUtcMysqlPool(uri: string) {
  const pool = createPool({ uri, timezone: "Z" });
  pool.on("connection", connection => {
    connection.query("SET time_zone = '+00:00'");
  });
  return pool;
}
