# 业务内容与运行配置管理 API

套餐、自拍姿势、亲密度、提示词、记忆、主题、主动联系、上传限制、模型与运行规则存储在 `productConfiguration` 的一条记录中。新库首次启动从 `server/seeds/product.json` 导入现有配置，包括 Free/Plus/Pro、9 个姿势、10 个亲密度等级、7 类奖励、6 个快捷提示词模板、现有系统提示词及记忆参数、8 套主题、通知模板、上传上限和模型／运行参数。重复启动不覆盖草稿或发布内容。当前开发阶段直接使用新的初始化表结构，不提供旧数据转换或兼容接口。

## 读取与发布

所有接口使用现有 tRPC 客户端，HTTP 路径前缀为 `/api/trpc`。管理操作使用 `/admin` 的独立单密码会话，不依赖用户账号或 `role` 字段，并复用现有 CSRF 校验。密码、会话和直接调用示例见 [管理后台](management.md)。

| 接口                           | 权限   | 含义                                                        |
| ------------------------------ | ------ | ----------------------------------------------------------- |
| `productConfig.get`            | 公开   | 读取完整发布配置、`revision` 和 `publishedAt`               |
| `productConfig.admin.getDraft` | 管理员 | 读取 `{ config, revision, publishedRevision, publishedAt }` |
| `productConfig.admin.save`     | 管理员 | `{ expectedRevision, config }`，完整替换草稿                |
| `productConfig.admin.publish`  | 管理员 | `{ expectedRevision }`，原子发布当前草稿                    |

`revision` 是并发修改令牌，保存与发布后递增；过期令牌返回 `CONFLICT`。不保存历史配置。保存草稿不影响线上读取与执行。保存及发布均校验完整配置；无效引用、重复 ID、支付变体冲突等返回 `BAD_REQUEST`，上一发布内容保持不变。

```ts
const draft = await client.productConfig.admin.getDraft.query();
const config = draft.config;
const basic = config.billing.plans.find(
  plan => plan.id === config.billing.defaultTierId
)!;
basic.limits.dailyMessages = 60;
config.selfies.poses.find(pose => pose.id === "aegyo")!.minLevel = 2;
config.intimacy.rules.text_message.basePoints = 3;
config.intimacy.dailyPointsLimit = 300;

const saved = await client.productConfig.admin.save.mutate({
  expectedRevision: draft.revision,
  config,
});
await client.productConfig.admin.publish.mutate({
  expectedRevision: saved.revision,
});
```

完整字段、限制及 TypeScript 类型见 [shared/productConfig.ts](../shared/productConfig.ts)。多语言文本至少包含 `zh-CN`，可附加 `en`、`ja`、`ko`；缺少当前语言时回退中文。

## 补查新增配置

本轮新增 `characters`（角色默认行为、字段/示例上限、资料提示词预算、多语言会话标题）、`emotion`（情绪结算和心情文案/颜色）、`experience`（分页、朗读、录音下限、连接及统计窗口）与 `site`（公开说明、运营链接）。各字段及约束见 [shared/experienceConfig.ts](../shared/experienceConfig.ts)，消费链路见 [检查记录](configuration-audit.md)。

`characters.conversationTitle` 的各语言必须包含且只使用 `{{name}}` 变量，并可容纳最长角色名。首次会话和显式新建都由服务端使用同一发布模板生成标题，客户端不再提交另一套固定文案。

`runtime.storage.requestTimeoutMs` 统一控制 S3 上传、读取和删除超时；`signedUrlTtlSeconds` 控制私有文件临时签名有效期。`memory.jobs.leaseMinimumMs` 与 `leasePaddingMs` 决定提取任务租约：取最短租约和 `runtime.ai.taskTimeoutMs + leasePaddingMs` 的较大值。本地草稿的编辑长度直接采用 `runtime.chat.maxInputChars`，恢复和网络核对不再固定截断到 8000 字。

## 套餐与执行

`billing.plans` 的顺序决定展示与升级顺序，可增删套餐、变更 ID、名称、月付/年付价格、结账地址、支付变体、启用状态与所有权益。订阅通过套餐 ID 关联，支付事件只根据 `lemonVariantId` 精确映射，不根据产品名称猜测。套餐停用或删除后，其订阅不再授予该套餐权益。默认套餐和自托管套餐必须存在且启用，默认套餐金额必须为零。

权益包括每日消息、每日或每月图片、角色数量、语音转写、TTS 服务、锁定默认模型及合照权限。数值 `null` 表示不限量，`0` 表示没有额度；图片不能同时设置日限额与月限额。`billing.rateLimits` 控制聊天、图片、转写、TTS 每分钟频率，`0` 禁止相应请求。合照读取 `couplePhoto`，不依赖套餐是否叫 Pro。`defaultChatModel` 用于 OpenRouter 默认模型；运营方 DeepSeek 模型由 `models.chat.deepseekModel` 管理，凭据从服务端环境读取。

`billing.mode` 控制运行模式：`free` 使用配置的默认套餐，`lemonsqueezy` 根据订阅关联套餐，`none` 使用配置的自托管套餐并豁免套餐计量和功能限制。用户自带对应服务的密钥继续豁免相关计量与权限，请求频率、姿势解锁和经验防刷不豁免。`BILLING_PROVIDER`、`LEMONSQUEEZY_CHECKOUT_*`、`LEMONSQUEEZY_VARIANT_*` 只在首次初始化时导入，之后修改环境变量不覆盖数据库；webhook 密钥仍从环境读取。配置中的展示价格不会修改支付平台的收款价格，运营时应将两者设置一致。

`billing.getInfo` 从同一发布快照返回套餐列表、当前权益及真实用量。聊天预留、图片预留、角色创建/恢复、语音服务和合照检查均使用发布权益；生成失败仍按原预留周期退款，配置变更不会改变已接受请求的额度记录。

## 姿势与等级

姿势的 ID、名称、emoji、别名、提示词、构图模式、启用状态与 `minLevel` 均可编辑。顺序就是展示顺序。聊天中的姿势识别读取启用姿势的名称和别名；默认姿势必须启用且在第一级解锁。服务端独立校验姿势是否存在、启用和已解锁。图片仍优先采用本次输入的场景描述，仅在输入为空时采用姿势提示词。

亲密度等级可配置 1–100 级，编号必须连续，首级门槛为零，其余经验门槛严格递增。等级名称、描述、阶段称呼、emoji 和颜色均来自配置。实际等级始终根据累计经验和当前门槛计算，修改门槛后不依赖角色行中缓存的等级。已获得的经验不因离线或修改门槛而扣减。阶段称呼用于面板展示，对话称呼仍遵循角色行为设定和用户意愿。

等级面板的解锁列表直接由启用姿势的 `minLevel` 与名称生成，不维护另一套解锁文案。前端查询每 60 秒刷新，并在窗口重新聚焦时刷新；服务端对新请求读取当前发布配置，最终权限以服务端为准。

## 奖励执行语义

动作类型是服务端实际支持的七类事件；可配置启用、基础分、额外分、阈值、冷却分钟和每日次数。奖励仅由真实业务成功写入触发，客户端不能提交奖励分值。

| 动作                | 条件和额外奖励                                                         |
| ------------------- | ---------------------------------------------------------------------- |
| `text_message`      | 文字达到 `minimumTextLength` 才奖励；长度严格大于该规则阈值时加额外分  |
| `voice_message`     | 使用真实转写凭据；录音时长严格大于阈值（毫秒）时加额外分               |
| `selfie`            | 图片成功保存；当天第一次获得此奖励时加额外分                           |
| `daily_first`       | 当天第一次可奖励互动，连续互动天数达到阈值时加额外分；每日次数固定为 1 |
| `edit_profile`      | 资料实际变更；更换头像或修改性格时加额外分，移除头像只有基础分         |
| `long_conversation` | 会话成功完成第 `bonusThreshold + 1` 轮时奖励一次，发放基础分与额外分   |
| `night_chat`        | 配置时区内处于夜间时段时随互动结算，额外分必须为零                     |

夜间窗口支持跨午夜，起止小时相同表示关闭。每日计量和连续互动按 UTC 自然日。一次业务事务中的文字、语音、深度对话共享同一配置快照，每日首次和夜间奖励不会在同一事务重复叠加。每类事件分别执行冷却与每日次数；奖励组超过 `dailyPointsLimit` 时整组不发放，也不消费对应次数。面板的分值、条件、次数、冷却及每日总上限均由这些执行字段生成。

初始化基线和快照已更新。新增配置回归在真实 MySQL 的回滚事务内修改配置，覆盖权限、草稿隔离、并发令牌、跨领域校验、动态套餐 ID、限额、姿势解锁、门槛变更和经验结算；前端回归验证新增 ID、多语言回退、动态展示及错误重试。

## 提示词与预览

第三批继续使用 `productConfig.admin.getDraft`、`save` 和 `publish`，一次发布完整的 `prompts` 与 `memory` 配置，并和前两批业务规则保持原子性。接口读取和权限不变。字段类型与校验见 [shared/aiConfig.ts](../shared/aiConfig.ts)。

- `prompts.quickTemplates`：设置页的快捷模板，包含任意稳定 ID、多语言名称和正文、启用状态；数组决定展示顺序。正文最多 500 字，选中时原样复制到用户草稿，保存后实际进入聊天偏好。更新模板不会替换用户已经保存的自定义偏好。
- `prompts.chat`：聊天主模板、表达方式、长度、主动性、情绪及原因、两种相处节奏下的关系阶段、称呼资料、语言和长度规则、记忆状态说明与安全提示。关系阶段按 `minLevel` 选择，等级由当前亲密度配置计算。
- `prompts.image`：参考图、文生图、合照及空场景兜底模板。实际场景仍优先使用本次输入，空输入时再使用姿势或默认场景。
- `prompts.extraction` / `summary`：记忆提取与摘要系统模板。提取模板中的 `{{maxLength}}` 从当前提取长度规则生成。
- `prompts.memoryContext` / `memoryTemporal`：记忆注入包装模板与未知、无日期、历史、明确日期的时间说明。`{{records}}` 是有来源、经过 JSON 转义的记录。
- `prompts.transcription`：语音转写的提示文案。
- `prompts.context`：总字符预算、平台预留、已接受补充和历史预算；记忆上限统一来自 `memory.recall.maxChars`。平台预留不足或超出总预算时不能发布。低优先级资料按完整块取舍，不切断 JSON 或已接受的用户补充。

模板使用 `{{变量名}}`，只能使用对应字段支持的具名变量，缺少或写错变量时返回 `BAD_REQUEST`；不执行 JavaScript、表达式或递归替换。参数中的同名花括号保持原文。角色和偏好通过转义后的 JSON 插入，源码中的结构、来源和用户归属校验继续执行。

角色编辑页的预览与服务端请求共用 `shared/chatPrompt.ts`，读取相同发布数据。预览使用当前表单资料；真实聊天再加入当轮情绪、有效记忆及对话历史。后台任务和聊天计量中的 `promptVersion` 使用 `product-config/<revision>:<动作>` 标识本次执行依据。

```ts
const draft = await client.productConfig.admin.getDraft.query();
const config = draft.config;
config.prompts.image.reference = "以参考图保持人物身份。画面要求：{{scene}}";
config.prompts.chat.expression.warm = "温和直接地回应，关注具体细节。";
config.memory.extraction.everyRounds = 3;
config.memory.maxEditedLength = 500;
config.memory.levelRules[0] = { minLevel: 1, capacity: 50, recallCount: 8 };

const saved = await client.productConfig.admin.save.mutate({
  expectedRevision: draft.revision,
  config,
});
await client.productConfig.admin.publish.mutate({
  expectedRevision: saved.revision,
});
```

## 记忆规则与执行

`memory.enabled` 是全局记忆开关，角色仍有独立暂停状态。关闭时不发起新的提取、索引、语义查询或摘要任务；已有事实保留给用户查看、编辑和删除，页面不能通过角色开关覆盖全局关闭。

| 配置                                     | 实际作用                                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `categories`                             | 四种可执行类别 `fact` / `preference` / `event` / `relationship` 的多语言名称和顺序，每类必须出现一次 |
| `levelRules`                             | 从等级 1 开始按门槛选择容量与日常召回数量；按累计经验推导当前等级，不信任缓存等级                    |
| `maxExtractedLength` / `maxEditedLength` | 模型提取与用户编辑的独立长度上限；服务端验证实际文本，页面编辑长度读取相同配置                       |
| `extraction`                             | 首轮提取、明确保存请求提取、每隔几轮提取、来源窗口、最多结果数、温度、输出上限和各服务的模型覆盖     |
| `matching`                               | 去重与更正相似阈值、初始权重上下限及重复强化幅度                                                     |
| `ranking`                                | 新鲜度下限、衰减天数、词面相关性系数／上限、置顶加分                                                 |
| `semantic`                               | 当前 OpenRouter 服务内使用的语义模型、索引批量大小及语义排序权重；模型为空时使用词面召回             |
| `summary`                                | 摘要启用状态、事实／消息窗口、话题数量、原句长度与输出上限                                           |
| `recall`                                 | 明确回忆时是否可使用整个角色容量，以及完整记忆注入块的字符上限                                       |
| `jobs`                                   | 后台每批任务数量、最多尝试次数及重试退避上下限                                                       |

容量淘汰保留置顶记录；置顶条数超过容量时不自动删除置顶内容。来源归属、逐字原话、否定／转述排除、遗忘边界和引用版本验证仍由服务端代码执行，配置不能让模型直接写入任意事实。

`memory.state` 返回当前发布的 `rules`、服务端计算的 `capacity` 与 `configurationRevision`。页面分类、容量和编辑上限直接消费这些字段。提取、索引和摘要在一个执行单元内固定使用同一快照；提交时核对发布标识，发现变化时不写回旧结果，提取任务按配置重试。摘要保存 `configurationRevision`，发布变化后旧摘要不再展示或注入，后台重新生成后才恢复。初始化 SQL 和快照包含该字段，不提供旧摘要回填。

`COMPANION_MEMORY_ENABLED`、`MEMORY_EXTRACTION_MODEL`、`MEMORY_EMBEDDING_MODEL` 和 `CHAT_CONTEXT_CHAR_LIMIT` 只在新库首次初始化时导入；之后通过 API 管理。服务地址、通用 AI 预算／超时与并发由下述模型及运行配置管理；凭据继续从环境和密钥服务读取。

## 主题与账号偏好

`themes.defaultThemeId` 指定启用中的默认主题，`themes.items` 顺序决定主题菜单和色卡顺序。每项包含稳定 `id`、`enabled`、多语言 `name`／`description`、预览 `colors`、明暗主色 `light`／`dark`、明暗背景 `background`、`foreground` 与 `hue`。颜色仅接受六位十六进制值。主题 ID 不再使用数据库或前端枚举，新增主题可以直接保存到账号；删除或停用已选择的主题后，展示回到当前默认主题。

账号的语言与显示模式仍独立保存。`PreferencesProvider` 使用公开发布配置应用 CSS 语义色、浏览器主题色及色卡；生产前端不导入初始色卡或主题名称映射。

## 主动联系与通知

`proactive` 的设置同时驱动设置页校验、联系规划和真实 outbox：

| 字段                                  | 用途                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| `enabled`、`defaults`                 | 全局可用性与新账号默认偏好；默认主动联系必须为关闭，由用户明确启用                    |
| `frequencyDays`                       | 用户可选择的最小／最大间隔；默认间隔必须位于范围内                                    |
| `minimumGapMs`、`unreadBackoff`       | 最近互动／联系的时间下限，以及连续未读时的指数退避和天数上限                          |
| `events.upcomingDays`／`followupDays` | 可以提醒的未来／过去事件窗口                                                          |
| `contactLifetimeMs`、`leaseMs`        | 联系有效期和共享投递租约                                                              |
| `tickMs`、`batchSize`、`retry`        | 调度、每批任务数量、免打扰延期和失败重试                                              |
| `pushTimeoutMs`                       | 单设备推送时限，发布时必须小于租约                                                    |
| `client`                              | 未读轮询、首次检查与后续检查间隔                                                      |
| `templates`                           | 多语言通知模板，保存的 `{ key, values }` 在站内和推送时共用 `renderNotification` 渲染 |

模板只接受 `{{name}}`、`{{memory}}`、`{{eventDay}}`，插值执行一次，用户内容不会递归解析。当前执行使用 `notifications:title.thinkingOfYou`、`eventUpcoming`、`eventToday`、`eventFollowUp`、`dailyCompanion`，以及私密预览的 `privateTitle`、`privatePreview`（均带 `notifications:` 前缀）；这些模板不能删除。私密预览模板不能插入角色或事件变量。历史内置候选通知也作为初始模板保留，可通过 API 编辑。

默认关闭、显式同意、角色和事件来源验证、免打扰与本地日边界仍由代码强制执行。关闭全局开关或缩短事件窗口后，发送前的当前配置检查会取消不再合格的待投递联系。已经发送到设备的推送保留发送时的文案。

## 上传限制

`uploads.avatar`、`reference`、`couple`、`official` 分别配置图片 `maxBytes` 和允许的 `mimeTypes`；音频使用 `uploads.audio`，另有录音编码优先顺序、采样率、分块间隔和 `maxDurationSeconds`。前端的文件选择、错误提示、录音计时与后端解码校验直接使用这些字段，转写后的真实音频时长也会执行上限检查。允许的 MIME 是应用已实现的格式集合的子集。

`uploads.requestMaxBytes` 控制每次 HTTP 请求的 JSON／表单解析上限，发布后无需重启。配置校验确保上限足以容纳最大文件的 Base64 膨胀和元数据；语音大小不超过当前转写协议支持的 25 MiB。官方图片额外验证文件签名，配置不绕过格式检查。

## 模型、工作流与运行参数

| 字段                                       | 实际使用位置                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `models.chat`                              | 运营方聊天服务、可选兼容网关、DeepSeek 默认模型；OpenRouter 默认模型继续使用 `billing.defaultChatModel`            |
| `models.image`                             | 运营方图片服务、ComfyUI 地址、fal 自拍和合照模型                                                                   |
| `models.image.workflows.text`／`reference` | 完整 ComfyUI 节点、模型文件、分辨率、采样参数与提示词／种子／输出／参考图节点绑定；工作流 `id` 同时用于计量身份    |
| `models.transcription.model`、`models.tts` | 实际 Whisper、ElevenLabs、Fish Audio 请求的模型和相同计量记录                                                      |
| `runtime.ai`                               | 每用户每日内部 AI 尝试预算与任务总超时；失败调用仍占预算                                                           |
| `runtime.chat`                             | 输入和输出字数、输出 token、温度、top-p、DeepSeek thinking、排队／回复超时、并发、补发条数、租约与心跳、分段和调度 |
| `runtime.image`                            | 生图、下载与 ComfyUI 请求／轮询时限、输出文件上限、预留宽限时间                                                    |
| `runtime.voice`                            | 转写／TTS 请求超时、TTS 字数与音频保留时间、转写行为凭据有效期                                                     |
| `runtime.catalog`                          | 模型／音色目录超时、Fish Audio 每页数量                                                                            |
| `runtime.maintenance`                      | 回收调度、媒体租约／退避／批量、暂存保留时间、角色回收站保留天数、限流窗口清理和通用生成预留时限                   |
| `billing.mode`、`billing.pastDueGraceMs`   | 计费模式与欠费宽限期                                                                                               |

调度器下一轮读取当前发布参数，业务执行单元固定使用捕获的配置。已接收聊天保留原先接受的模型身份；如果运营方路由或凭据来源已经改变，旧任务结束失败，不把旧请求转发给其他接收方。用户 OpenRouter BYOK 始终发送官方端点，用户 fal BYOK 优先于运营方图片服务。通用 AI 任务总超时也会限制语音等子请求的实际等待时间。

工作流运行时直接读取数据库节点；`workflows/comfyui/` 是初始工作流的示例，修改这些文件不会修改已经发布的工作流。业务初始环境变量仅在配置表为空时导入，之后改动 `.env` 不会覆盖 API 配置。数据库、认证、对象存储、邮件连接和 API／VAPID／webhook 密钥仍是部署设置，不包含在公开配置中。

```ts
const draft = await client.productConfig.admin.getDraft.query();
const config = draft.config;
config.themes.items[0].name = { "zh-CN": "新的主题名称" };
config.proactive.frequencyDays.max = 30;
config.proactive.templates["notifications:dailyCompanion"] = {
  "zh-CN": "{{name}} 想和你聊一会儿。",
};
config.uploads.avatar.maxBytes = 5 * 1024 * 1024;
config.models.chat.deepseekModel = "your-model-id";
config.runtime.chat.maxTokens = 2048;
const saved = await client.productConfig.admin.save.mutate({
  expectedRevision: draft.revision,
  config,
});
await client.productConfig.admin.publish.mutate({
  expectedRevision: saved.revision,
});
```
