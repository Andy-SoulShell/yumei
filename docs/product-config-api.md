# 套餐、姿势与亲密度管理 API

套餐、自拍姿势与亲密度规则存储在 `productConfiguration` 的一条记录中。新库首次启动从 `server/seeds/product.json` 导入现有配置，包括 Free/Plus/Pro、9 个姿势、10 个亲密度等级、7 类奖励及四种语言文案。重复启动不覆盖草稿或发布内容。当前开发阶段直接使用新的初始化表结构，不提供旧数据转换或兼容接口。

## 读取与发布

所有接口使用现有 tRPC 客户端，HTTP 路径前缀为 `/api/trpc`。管理操作需要 `role=admin` 的登录会话，并复用现有 CSRF 校验。

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

## 套餐与执行

`billing.plans` 的顺序决定展示与升级顺序，可增删套餐、变更 ID、名称、月付/年付价格、结账地址、支付变体、启用状态与所有权益。订阅通过套餐 ID 关联，支付事件只根据 `lemonVariantId` 精确映射，不根据产品名称猜测。套餐停用或删除后，其订阅不再授予该套餐权益。默认套餐和自托管套餐必须存在且启用，默认套餐金额必须为零。

权益包括每日消息、每日或每月图片、角色数量、语音转写、TTS 服务、锁定默认模型及合照权限。数值 `null` 表示不限量，`0` 表示没有额度；图片不能同时设置日限额与月限额。`billing.rateLimits` 控制聊天、图片、转写、TTS 每分钟频率，`0` 禁止相应请求。合照读取 `couplePhoto`，不依赖套餐是否叫 Pro。`defaultChatModel` 用于 OpenRouter 默认模型；运营方 DeepSeek 模型及密钥仍由部署环境管理。

`BILLING_PROVIDER` 继续控制部署模式：`free` 使用配置的默认套餐，`lemonsqueezy` 根据订阅关联套餐，`none` 使用配置的自托管套餐并豁免套餐计量和功能限制。用户自带对应服务的密钥继续豁免相关计量与权限，请求频率、姿势解锁和经验防刷不豁免。`LEMONSQUEEZY_CHECKOUT_*`、`LEMONSQUEEZY_VARIANT_*` 只在首次初始化时导入，之后修改环境变量不覆盖数据库；webhook 密钥仍从环境读取。配置中的展示价格不会修改支付平台的收款价格，运营时应将两者设置一致。

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
