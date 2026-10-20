# YUMEI

YUMEI 是可自托管的 AI 角色陪伴 Web 应用，支持文字与语音聊天、场景自拍、长期记忆和亲密度养成，可作为 PWA 安装到手机桌面。面向 18+ 用户，所有伴侣均为 AI 角色。

当前版本为 **1.0.0**，默认角色名为 **YUMEI**，包名和部署标识为 `yumei`。首版以作者已有代码建立基线；[PRD v0.6](docs/亚洲版成人AI角色陪伴产品_PRD_v0.6.md) 是后续产品目标，尚未全部实现。[原版设计说明书](docs/YUMEI_原版设计说明书.md) 用于了解原有设计。

## 已有功能

- 对话：OpenRouter 或 DeepSeek，持久化分句流式回复、停止、连续补发与刷新恢复；回复语言、长度和全局偏好。
- 角色：默认角色、20 个带独立参考图与风格的预设（写实／动漫各 10 位）、自定义表达方式、关系节奏、称呼和对话示例，支持头像、回收站与历史搜索。
- 图片：fal.ai 或自托管 ComfyUI，参考图自拍、场景描述、亲密度姿势解锁及合照。
- 语音：OpenAI Whisper 转写，浏览器、ElevenLabs、Fish Audio 朗读。
- 养成：亲密度、情绪惯性与恢复、带来源的记忆/摘要、可配置语义召回、记忆更正/暂停/遗忘。
- 联系：默认关闭的主动陪伴，按账号时区执行事件关心、日常模式、免打扰、忽略退避和隐私预览；站内通知与可选 Web Push。
- 界面：中文、英文、日文、韩文切换，八套主题配色、浅色/深色/跟随系统，登录后按账号保存偏好。
- 账号：邮箱密码注册、邮箱验证、密码登录、忘记密码及邮箱链接登录；PC 使用弹框，手机使用独立页面。
- 部署：本地或 S3 存储、Free/Plus/Pro 套餐、Lemon Squeezy 订阅及 BYOK。

使用流程见 [USER_GUIDE.md](USER_GUIDE.md)。

首页 `/` 为未登录用户的默认入口，依次展示三张产品轮播、10 位精选陪伴（宽屏每排 10 位，小屏自动换行，无横向滚动）、前 20 位角色、折叠常见问题和注册引导。导航不设置“首页”项，点击顶部 Logo 即可返回。探索页 `/explore` 独立提供搜索和写实／动漫筛选，每次展示 20 个角色，更多角色通过“加载更多”展开；搜索、筛选及加载进度保存在 URL 中。

PC 使用左侧导航，手机使用底部导航；“聊天”展示最近会话，“我的角色”保留编辑、亲密度与回收站。两张公开页面共用角色详情，游客开始聊天时登录并返回原来的角色和筛选条件，仍遵循现有套餐角色上限；“生成”可选择已有角色，进入聊天中的图片生成。首页注册入口在 PC 打开注册弹框，手机进入注册页面；已登录用户看到继续探索入口。新增角色封面使用 AI 生成，原有角色封面保留。

在设置的“外观与语言”中选择界面语言、显示模式和主题，修改后立即生效并自动保存。界面语言默认跟随浏览器，支持简体中文、English、日本語和 한국어；显示模式默认跟随系统，默认配色为“东京日落”。八套配色可分别搭配浅色或深色模式。登录前的选择保存在本机，首次登录的新账号会继承这些选择；已有账号以服务端保存的偏好为准，其他设备登录后也可恢复。保存失败时保留本机选择并提供重试。

界面语言独立于设置中的“AI 回复语言”；用户输入、已有角色资料、聊天记录和记忆原文保持原样。验证、重置和登录邮件按表单当前选择的语言生成。

邮箱密码注册需要先验证邮箱；密码为 8–128 个字符。验证和重置链接均在 15 分钟后过期，重置链接仅能使用一次。重置密码会撤销原有会话，需重新登录。已通过邮箱链接注册的用户可在“忘记密码”或设置的“账号安全”中为原账号设置密码，角色和历史记录保留；已有密码可在设置中修改，修改时撤销其他会话。

界面交互以 Radix Primitives 为基础，通过 shadcn CLI 维护 [公共组件源码](client/src/components/ui)。搜索选择组合 Popover 与 Command，日期选择组合 Popover 与基于 React DayPicker 的 Calendar；主题、语言和业务操作复用公共组件。新增组件与更新定制代码的约定见 [贡献指南](CONTRIBUTING.md#界面组件)。

## 本地开发

需要 Node.js 22 或 24、Corepack 和 MySQL 8。项目固定使用 pnpm 10.4.1；执行 `corepack pnpm` 可避免全局 pnpm 版本覆盖项目版本。开发、构建、启动和测试入口均支持 Windows PowerShell 与 Linux shell。

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
```

在 `.env` 中设置独立的 `DATABASE_URL`，并为 `JWT_SECRET`、`KEY_ENCRYPTION_KEY` 分别填入两个不同的随机密钥（各至少 32 字符，可分别运行 `openssl rand -hex 32` 生成）。对话需要运营方 AI Key，或登录后在设置中填入自己的 Key。

```bash
pnpm db:migrate
pnpm dev
# http://localhost:3000
```

开发模式未配置邮件服务时，验证、重置和登录链接打印在服务器终端。开发环境及显式 `EMAIL_PROVIDER=stdout` 的本地运行支持 `http://localhost:3000`、`http://127.0.0.1:3000`、本机局域网 IP 和本机 `.local` 域名；邮件链接会保留发起请求时的访问主机。自定义局域网域名可在 `.env` 的 `VITE_EXTRA_ALLOWED_HOST` 中补充，多个以逗号分隔，并通过局域网 DNS 或 hosts 解析到本机。各主机地址的登录 Cookie 独立，切换地址需要分别登录。启动时识别网卡地址，局域网 IP 改变后需要重启开发服务。用户上传文件默认写入 `data/uploads/`，配置和运行数据均不纳入 Git。

接口中的本站图片、头像和音频统一返回 `/files/...` 同源路径，已有记录中的 localhost、127.0.0.1 和已识别局域网地址也在响应时转换，切换访问地址后无需重新上传。外部 CDN 与 S3 预签名地址保持原样；服务端调用外部图片服务时继续使用配置的公开文件地址。

## Docker 部署

准备 `.env` 后运行：

```bash
docker compose up --build
```

应用默认监听 `http://localhost:3000`，启动时自动应用数据库迁移。MySQL 和上传文件分别保存在 Docker 卷中。

公网部署需设置 `BETTER_AUTH_URL`、邮件服务和 `EMAIL_FROM`，并替换示例数据库密码。邮件支持 `RESEND_API_KEY` 或 `EMAIL_PROVIDER=smtp` 配合 `SMTP_*`。仅在本机验证 Docker 登录时，可显式设置 `EMAIL_PROVIDER=stdout`，从容器日志获取登录链接。

完整配置见 [.env.example](.env.example) 和 [docker-compose.yml](docker-compose.yml)。

## AI 与存储配置

| 配置                                                  | 用途                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| `LLM_PROVIDER=openrouter`                             | 默认聊天接口，使用 `OPERATOR_OPENROUTER_KEY`                        |
| `LLM_PROVIDER=deepseek`                               | DeepSeek 官方接口，使用 `OPERATOR_DEEPSEEK_KEY` 和 `DEEPSEEK_MODEL` |
| `IMAGE_PROVIDER=fal`                                  | 默认图片接口，使用 `OPERATOR_FAL_KEY`                               |
| `IMAGE_PROVIDER=comfyui`                              | 自托管图片接口，使用 `COMFYUI_BASE_URL`                             |
| `OPERATOR_OPENAI_KEY`                                 | Whisper 语音转写                                                    |
| `OPERATOR_ELEVENLABS_KEY` / `OPERATOR_FISH_AUDIO_KEY` | 高级语音合成                                                        |
| `STORAGE_DRIVER=local`                                | 默认存储，目录由 `STORAGE_LOCAL_DIR` 指定                           |
| `STORAGE_DRIVER=s3`                                   | S3 兼容存储，需填写 `S3_*`                                          |

用户在设置中填入的 BYOK Key 优先于对应运营方 Key。聊天、参考图、音频等会发送到所选 AI 服务；第三方如何处理数据取决于服务商政策。

ComfyUI 示例：

```dotenv
IMAGE_PROVIDER=comfyui
COMFYUI_BASE_URL=http://192.168.0.20:8188
COMFYUI_TIMEOUT_MS=600000
```

应用进程或容器必须能访问该地址。可选 `COMFYUI_API_KEY` 会作为 Bearer Token 发送给反向代理。远端需安装 [工作流](workflows/comfyui/) 所用的节点与模型。

聊天中明确请求自拍，或点击相机并输入场景描述，即可生成图片；相机支持参考图生图和文生图。ComfyUI 由后端读取并上传参考图，无需远端访问应用的本机地址。默认输出 864×1536 竖图，参考图居中裁切到相同比例；排队和生成默认等待上限为 10 分钟，超时后远端任务可能仍在运行。用户自带 fal.ai Key 时优先使用 fal.ai。

## 套餐与额度

`BILLING_PROVIDER=free` 是默认值，对未使用 BYOK 的用户执行免费额度。`lemonsqueezy` 启用订阅，需配置 webhook 密钥与结账链接；`none` 才是全功能、不计量的自托管模式。

默认免费层为每用户每 UTC 日 30 条消息、1 张自拍、1 个角色。BYOK 绕过对应服务的用量计量；请求频率和亲密度防刷限制仍然生效。完整规则见 [shared/quotas.ts](shared/quotas.ts)。

## 数据库迁移

当前处于开发阶段，不维护旧表结构兼容或旧数据升级。仅保留 [0000_init.sql](drizzle/0000_init.sql) 与对应快照，一次创建 29 张业务表，面向新的 YUMEI 数据库。已有开发库需要删除并重新创建后再迁移；不要在旧库上直接套用这个初始化基线。

```bash
pnpm db:migrate                      # 应用已有迁移
pnpm db:generate --name=change_name   # 修改 schema 后生成增量迁移
pnpm db:migrate
```

本阶段允许重建初始化基线并重置开发数据。跨部署导入的 BYOK 密文不能复用，需要重新录入 Key。

陪伴功能的配置限制、降级、隐私边界、发布、配套备份与回滚见 [运行手册](docs/companion-operations.md)；逐批测试及浏览器证据见 [升级验收记录](docs/companion-upgrade-plan.md)。

## 开发检查与测试

| 命令                                | 用途                                          |
| ----------------------------------- | --------------------------------------------- |
| `pnpm typecheck`                    | 检查源码、测试、schema 与 TypeScript 配置     |
| `pnpm lint` / `pnpm lint:fix`       | ESLint 检查 / 自动修复，包含 React Hooks 规则 |
| `pnpm format:check` / `pnpm format` | Prettier 检查 / 格式化                        |
| `pnpm check`                        | 依次执行类型、lint 和格式检查                 |
| `pnpm build`                        | 构建前端和服务端                              |
| `pnpm start`                        | 启动生产构建                                  |

生成的迁移、快照、ComfyUI JSON 工作流及两份导入的产品文档不参与格式化。GitHub Actions 在 push 和 Pull Request 时运行静态检查、测试库迁移、完整测试、时区专项和生产构建。

完整测试需要**已应用迁移的专用 MySQL 测试库**，库名必须包含 `test`，测试会写入数据。复制 `.env.test.example` 为 `.env.test.local` 并配置测试专用密码后，执行以下命令；测试不会将应用 `.env` 的密钥加载进测试进程。

```bash
pnpm test:db:up
pnpm test:db:migrate
pnpm test
# 初始化基线改变时，重建专用测试库并迁移（清除测试数据）
pnpm test:db:reset
```

环境变量优先于 `.env.test.local`，CI 显式提供 `DATABASE_URL`。启动时检查库名、与应用库的隔离、连通性和迁移校验和，配置错误会直接失败。完整测试默认在 UTC 下运行；通知频控还会单独以 Asia/Shanghai 应用时区验证。数据库日期编解码和连接会话统一 UTC。CI 创建独立 MySQL，执行依赖审计、迁移、完整测试和构建。本地回归不调用真实 AI、支付或邮件服务。

## 项目结构

```text
client/       React 19、Tailwind 4、PWA 与静态角色资源
  src/features/ 页面控制器与按业务划分的展示区块
server/       Express、tRPC、Better-Auth、AI 服务及测试
  database.ts 连接、事务类型与用户事务锁
  repositories/ 按用户、角色、会话、相册等划分的数据操作
  routers/    按业务划分的 tRPC 过程，由 routers.ts 组合
shared/       前后端共享的类型、角色、配额和提示词规则
drizzle/      MySQL schema、初始化 SQL 与迁移元数据
workflows/    ComfyUI 工作流
docs/         产品 PRD 与原版设计说明书
```

认证使用邮箱 magic-link 和数据库会话。业务写操作校验归属与 CSRF，用户 API Key 采用 AES-256-GCM 加密存储，响应只返回密钥是否设置及末四位。聊天正文通过 React 文本节点渲染。详细说明见 [SECURITY.md](SECURITY.md)。

消息、图片和资料修改在业务事务中结算亲密度与心情；客户端不能单独上报奖励。会话与消息使用游标分页，搜索先约束用户归属。限流窗口、记忆提取任务和媒体回收队列持久化到数据库，任务以租约领取，重启后可恢复；达到重试上限的记忆任务保留为失败状态供排查。进程启动即恢复后台处理，退出时停止调度。

贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)，变更见 [CHANGELOG.md](CHANGELOG.md)。代码采用 [MIT License](LICENSE)。
