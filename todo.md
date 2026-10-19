# YUMEI — 状态与待办

v1–v3 的功能清单（对话、自拍、语音、多女友、亲密度等）已全部完成，历史见
[`CHANGELOG.md`](CHANGELOG.md)。v4 的生产化重构（自托管、记忆、订阅、体验）
也已落地，里程碑 M1–M4 见 `README.md` 的 Project status。

## 已完成（v4 / M1–M4）

- [x] M1 独立可用：邮箱登录、本地/S3 存储、OpenRouter 唯一 AI 路径、
      服务端限流+配额、Docker、合规三件套
- [x] M2 长期记忆：提取 / 注入 / 「她记得你的事」页面 / 记忆型主动消息
- [x] M3 订阅：Lemon Squeezy 三档 + 档位配额 + 自托管全解锁
- [x] M4 体验：亲密度解锁自拍姿势 / 合照 / 语音往返 / Web Push

## 待办（非阻塞的加固项）

- [ ] 数据层：外键 + 热路径索引 + 事务（Phase 2）
- [ ] 架构：拆分 routers.ts / db.ts，Provider 超时重试熔断（Phase 3）
- [ ] 运维：GitHub Actions CI、结构化日志（pino）、Sentry（Phase 5）
- [ ] 前端：拆分 Settings/Home/Chat 巨型组件，全量 i18n（en + zh）（Phase 6）
- [ ] 合规：账号数据导出 / 删除（Phase 6）
