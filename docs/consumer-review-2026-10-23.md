**YUMEI C 端界面与服务走查 · 2026-10-23**

以下是修复前基线的走查记录。当前功能覆盖较完整，主要短板是：普通用户仍需要理解服务商、API Key、额度和配置；发现角色、建立关系、持续使用、付费及退出之间还有断点。建议下一轮优先补服务可用性、错误解释和用户控制，再调整首页与导航。

走查基线为 `d0e0c2e`。检查了 React 页面、认证、角色、聊天、记忆、图片、语音、套餐与主动联系代码；浏览器检查桌面和 390×844 手机视口。游客页面使用现有本地服务，登录后的操作使用独立临时 MySQL、合成账号和本地模拟上游。走查阶段未修改应用代码、现有账号、聊天数据或已发布配置；后续修复见下表。

证据分为「已复现」「代码确认」「产品判断」。本次没有重新验证真实模型自然度、真实支付、实体手机麦克风与系统推送。模拟上游返回的英文固定回复不能用来判断真实模型的语言表现。

| 优先级                       | 问题                                         | 证据                           | 主要影响                                 |
| ---------------------------- | -------------------------------------------- | ------------------------------ | ---------------------------------------- |
| P1                           | 01. 运营方语音已配置，用户仍无法选择音色     | 已复现＋代码                   | 站点提供的语音服务卡在配置入口           |
| P1                           | 02. 日额度用尽被提示为请求频繁               | 已复现＋代码                   | 用户反复重试，不知道何时恢复             |
| P1                           | 03. C 端数据控制与隐私说明不完整             | 界面＋代码                     | 用户无法方便地管理或带走私密数据         |
| P1，开通收费前               | 04. 订阅只有购买入口，缺少管理与售后路径     | 代码确认                       | 续费、取消、付款异常缺少站内处理入口     |
| P1                           | 05. 新账号默认为 UTC，未引导确认实际时区     | 已复现＋代码                   | 免打扰、事件日期和相对日期可能偏移       |
| P2                           | 06. 首页图片占比高，角色详情决策信息少       | 已复现＋产品判断               | 用户难以根据相处方式挑选角色             |
| P2                           | 07. 创建流程过长，名额检查出现太晚           | 界面＋代码                     | 填完长表单才得知不能创建                 |
| P2                           | 08. 角色编辑草稿离开页面即丢失               | 已复现＋代码                   | 手机切页、返回及切换预设造成返工         |
| P2                           | 09. 角色详情没有正确接入返回历史             | 已复现＋代码                   | 手机按返回直接离开角色目录               |
| P2                           | 10. 图片任务的恢复体验弱于文字和视频         | 代码确认                       | 长任务刷新后缺少可辨认的进行状态         |
| P2                           | 11. 更正一条记忆会截断整个角色的旧聊天上下文 | 代码确认，已明确提示的设计取舍 | 修正一个事实会影响其他未保存的谈话连续性 |
| P2，日本／韩国发布前重点处理 | 12. 日韩界面与服务意图识别覆盖不一致         | 直接函数验证＋代码             | 同一功能在不同语言下触发结果不同         |

P1 表示影响核心服务、信任或商业交付，应优先处理；P2 表示影响使用效率、理解和连续性。没有把未实现的 PRD 全部列为当前版本故障。

后续已继续补齐 03、04：隐私与数据管理、订阅管理和站内售后，参见[服务补齐与验收记录](consumer-services-2026-10-23.md)。

**本轮修复进度**

已按确认的范围完成 01、02、05、08、09，分别提交：

| 项目 | 已实现行为                                                                          | 提交                 |
| ---- | ----------------------------------------------------------------------------------- | -------------------- |
| 语音 | 按服务端配置与套餐权益加载站点音色，用户 Key 为可选入口；未保存时不能误用旧音色试听 | `ee9aca7`            |
| 额度 | 分开解释额度、频率、并发与追问限制；输入区、失败消息与套餐卡展示本地恢复时间        | `f1a592d`、`825d6b0` |
| 时区 | 首次确认设备时区后进入业务页；已有账号保留保存值，不会自动开启主动联系              | `ce7ee92`            |
| 草稿 | 角色资料和回复／服务偏好按账号、表单恢复；预设覆盖需确认，较早保存不清理新草稿      | `b69463d`            |
| 返回 | 打开详情增加历史，返回先关闭详情；分享链接关闭留在目录，保留搜索和筛选              | `1152345`            |

普通草稿保存在当前标签页的 sessionStorage；密码和 API Key 不进入草稿。选中文件仅在内存中恢复，刷新前提示，刷新后要求重选或明确保留原图。退出登录清理本标签页草稿。

验证：独立临时 MySQL 下 168 个测试文件、1461 项测试通过；额外在 `Asia/Shanghai` 下运行的 35 项联系偏好相关测试通过。TypeScript、全仓 ESLint、Prettier 与生产构建通过。构建仍有现有体积及第三方注释告警。

浏览器验收使用 390×844 手机视口和 1440×900 桌面视口、独立临时库与合成 Plus 账号。已确认首次时区引导、站点音色选择／保存／合成请求、普通草稿切页及刷新恢复、预设覆盖确认，以及额度耗尽时的持续提示；原生返回先关闭详情、保留筛选并恢复卡片焦点，再次返回回到首页。上游服务为本地模拟，未验证真实供应商音质和真实付款。

[时区确认截图](/Users/andy/Desktop/yumei/output/playwright/fixes-timezone-mobile.png) · [站点音色截图](/Users/andy/Desktop/yumei/output/playwright/fixes-voice-mobile.png) · [草稿恢复截图](/Users/andy/Desktop/yumei/output/playwright/fixes-draft-mobile.png) · [额度耗尽截图](/Users/andy/Desktop/yumei/output/playwright/fixes-quota-mobile.png)

其余问题保留为后续工作；本文下方的复现、定位与建议描述修复前基线。

**01｜高级语音入口错误地依赖用户自带 Key**

前端用 `keys.elevenlabs.isSet` 和 `keys["fish-audio"].isSet` 决定是否加载音色。这两个字段只表示用户是否保存了 BYOK，不能代表运营方服务是否可用。后端音色接口本身支持运营方凭据，生成服务也允许符合套餐的用户使用运营方凭据。

复现：在仅配置运营方模拟 ElevenLabs 凭据、用户没有 BYOK 的环境中，选择 ElevenLabs，界面只有 Key 输入和保存入口，没有音色选择器；同一已登录账号直接请求音色接口返回 HTTP 200、一个模拟音色。Fish Audio 存在相同的前端判断；本次未单独浏览器复现 Fish Audio。

建议由服务端返回各语音服务的可用状态与当前用户权益。普通用户先选声音；BYOK 作为高级选项。只有确实不可用时才解释配置或升级条件。

定位：[useProviderCatalogs.ts:54](/Users/andy/Desktop/yumei/client/src/features/settings/useProviderCatalogs.ts:54)、[apiConfig.ts:208](/Users/andy/Desktop/yumei/server/routers/apiConfig.ts:208)、[tts.ts:185](/Users/andy/Desktop/yumei/server/routers/tts.ts:185)。[手机截图](/Users/andy/Desktop/yumei/output/playwright/review-voice-operator-mobile.png)。

验收：运营方提供服务且用户有权益时，不填 BYOK 也能选择、试听、保存并使用音色。

**02｜额度、频率与并发错误混在一起**

日／月额度耗尽与短时间限流都使用 `TOO_MANY_REQUESTS`。流式路由不传递具体配额原因；前端看到 HTTP 429 就显示“请求过于频繁，请稍后重试”。图片路径反过来将所有同类错误解释成自拍额度问题。输入区没有文字剩余额度；图片额度耗尽时按钮禁用，主要解释放在 `title`，手机用户难以发现。

复现：只将独立测试账号的当日聊天计量设为 30/30，再发送消息；服务端拒绝，页面显示“未发送／重试”，提示为“请求过于频繁，请稍后重试”。重试仍然失败。服务按 UTC 日计量，上海用户的重置点为本地 08:00，设置里没有给出这个明确时间。

建议增加结构化原因，例如配额耗尽、请求过快、并发过多，并携带 `resetAt` 或 `retryAfter`。在聊天内说明“今日额度已用完，明天 08:00 恢复”，按站点实际能力提供升级或 BYOK 入口，避免只放一个反复失败的重试按钮。

定位：[generations.ts:123](/Users/andy/Desktop/yumei/server/generations.ts:123)、[chatStreamRoutes.ts:23](/Users/andy/Desktop/yumei/server/_core/chatStreamRoutes.ts:23)、[useChatController.tsx:486](/Users/andy/Desktop/yumei/client/src/features/chat/useChatController.tsx:486)、[ChatComposer.tsx:202](/Users/andy/Desktop/yumei/client/src/features/chat/ChatComposer.tsx:202)。[失败状态截图](/Users/andy/Desktop/yumei/output/playwright/review-chat-quota-mobile.png)。

验收：三种拒绝原因分别显示准确解释和可执行的下一步；日额度耗尽时显示用户本地恢复时间。

**03｜用户能删除角色，但缺少细粒度的数据管理与账号退出服务**

角色回收站与永久删除已实现，这部分应保留。但会话路由和聊天页面没有单独删除会话的入口；设置页没有账号注销和数据导出；认证配置没有开启账户删除。用户想清理一段私密聊天时，现有可见的清理路径会牵涉整个角色及其关系数据。

注册页强调“本站不使用聊天内容训练模型”，实际聊天、参考图和音频会发往所选第三方服务，这个重要边界主要写在 README。公开页脚只有 AI／18+ 说明，没有隐私说明、使用条款或常规客服入口。现有 `support` 还用于危机支持资源，不宜同时承担账号、付费和技术售后。

建议增加隐私与数据设置：按会话删除、导出、账号删除和删除进度；分别解释本地数据、长期记忆、媒体与第三方处理。注册和首次上传应能直接查看相应说明。这里是产品信任与服务完整性判断，不作法律合规结论。

定位：[conversation.ts](/Users/andy/Desktop/yumei/server/routers/conversation.ts)、[Settings.tsx:78](/Users/andy/Desktop/yumei/client/src/pages/Settings.tsx:78)、[auth.ts:45](/Users/andy/Desktop/yumei/server/_core/auth.ts:45)、[DiscoveryFooter.tsx:9](/Users/andy/Desktop/yumei/client/src/components/DiscoveryFooter.tsx:9)、[zh-CN.ts:216](/Users/andy/Desktop/yumei/shared/locales/zh-CN.ts:216)。

验收：用户不必删除整个角色就能删除指定会话；能找到数据导出、账号删除与处理说明。

**04｜订阅服务缺少管理与售后闭环**

套餐卡能展示用量、打开结账链接和说明已取消订阅的剩余有效期，但没有管理当前订阅、取消续费、修改付款方式、查看账单及付款问题帮助入口。接口返回续费时间，前端没有展示。Plus 升级 Pro 仍然打开套餐结账链接；需要核实并处理现有订阅变更与重复订阅的关系，本次未作真实付款验证。

建议在开通收费前补齐“当前套餐／下次扣费日期与金额／管理订阅／付款帮助”。升级已有订阅应走明确的订阅变更流程，付款回来后显示权益确认状态。

定位：[BillingCard.tsx:139](/Users/andy/Desktop/yumei/client/src/components/BillingCard.tsx:139)、[billing.ts:45](/Users/andy/Desktop/yumei/server/routers/billing.ts:45)。

验收：从站内可以完成购买、核对权益、管理续费、取消及处理付款异常；这些步骤可在支付沙箱走通。

**05｜时区默认值会影响陪伴服务的实际行为**

新账号实际显示 UTC，初始免打扰为 22:00–08:00。账号没有在首次使用时确认设备时区，用户需要在设置里输入或选择 `Asia/Shanghai` 一类 IANA 名称。记忆与主动联系共用这个值。

上海用户若直接开启主动联系并保存，22:00–08:00 UTC 对应本地 06:00–16:00；界面文字却是“按本地时区”。“明天”等日期在跨日时段也可能与用户预期不一致。

建议首次使用时检测并让用户确认设备时区；对已有账号保留已保存选择。界面显示“北京时间 UTC+8”一类易懂名称，IANA 标识留在内部；启用主动联系时同时预览本地免打扰时段。

定位：[product.json:1172](/Users/andy/Desktop/yumei/server/seeds/product.json:1172)、[proactive.ts:49](/Users/andy/Desktop/yumei/server/proactive.ts:49)、[ProactivePreferences.tsx:374](/Users/andy/Desktop/yumei/client/src/features/settings/ProactivePreferences.tsx:374)。

验收：上海／东京等新账号的默认行为符合本地日历；跨设备登录不擅自覆盖用户保存的时区。

**06｜发现角色的页面重展示，轻选择依据**

390×844 下，首屏由轮播、三行精选头像和底部导航占满，角色目录还在下方。精选与下方目录重复相同角色。详情再次放大同一张图片，文字主要是名字、年龄、职业标签和一句介绍；性格、兴趣、互动节奏和示例对话没有在决定添加前展示。

这会让“选一个适合自己的陪伴”主要变成看图选择，角色之间的差异要进入编辑或聊天后才容易感知。是否影响转化需要真实用户验证，不能由截图直接推断。

建议手机首页减少重复内容，首屏提供少量可直接认识的角色；详情补充三项性格、适合的聊天场景、关系节奏和一段示例。添加前明确剩余名额。

定位：[Landing.tsx:75](/Users/andy/Desktop/yumei/client/src/pages/Landing.tsx:75)、[CharacterDetailDialog.tsx:38](/Users/andy/Desktop/yumei/client/src/components/CharacterDetailDialog.tsx:38)。[首页手机截图](/Users/andy/Desktop/yumei/output/playwright/review-landing-mobile.png)、[角色详情截图](/Users/andy/Desktop/yumei/output/playwright/review-character-mobile.png)。

**07｜创建流程把复杂配置和失败条件放得太晚**

创建页面依次展示预设、参考图、名字、性格、外貌、兴趣、五项相处设置、多组对话示例、角色音色和提示词。通过 `?preset=xiaotao` 进入时，本次还复现了已选小桃但预设区仍展开全部 20 位角色：展开状态初始化早于异步预设加载，没有随初始化收起。

前端没有提前显示当前角色名额，后端在提交时才拦截超限。创建成功又回到“我的角色”，用户还要再次进入聊天。对只想开始陪伴的用户，流程中的配置和跳转过多。

建议分成“快速创建”和“进一步定制”：前者只需要选形象、名字和少量风格；高级设置渐进展开。页面一进入即显示名额与可用操作，成功后提供直接开始聊天的主操作。

定位：[Setup.tsx:125](/Users/andy/Desktop/yumei/client/src/pages/Setup.tsx:125)、[CharacterPresetPicker.tsx:29](/Users/andy/Desktop/yumei/client/src/components/CharacterPresetPicker.tsx:29)、[girlfriend.ts:124](/Users/andy/Desktop/yumei/server/routers/girlfriend.ts:124)、[useSetupController.tsx:179](/Users/andy/Desktop/yumei/client/src/features/setup/useSetupController.tsx:179)。[创建页截图](/Users/andy/Desktop/yumei/output/playwright/review-create-mobile.png)。

**08｜角色草稿离开页面后没有保护**

复现：将角色名字从“小桃”改为测试文本，点击底部“探索”，再浏览器返回，名字恢复为“小桃”，没有离开提示或草稿恢复。角色表单主要使用页面内 `useState`。切换预设还会立即覆盖名字、性格、外貌、兴趣、行为、提示词、音色和上传图，没有确认或撤销。

设置中的部分手动保存草稿也只在当前组件内保留；外观自动保存、联系偏好独立保存、回复与服务设置集中保存等规则并存，增加理解成本。当前底部按钮已经写为“保存回复与服务设置”，不应再把它误报成保存按钮覆盖范围错误。

建议优先给角色资料增加按账号隔离的普通草稿恢复或离开保护，切换预设提供覆盖说明与撤销；密钥、密码等敏感输入保持不持久化。保存方式在每个分区明确说明。

定位：[useSetupController.tsx:55](/Users/andy/Desktop/yumei/client/src/features/setup/useSetupController.tsx:55)、[useSetupController.tsx:286](/Users/andy/Desktop/yumei/client/src/features/setup/useSetupController.tsx:286)、[useSettingsDraft.ts:8](/Users/andy/Desktop/yumei/client/src/hooks/useSettingsDraft.ts:8)。

验收：编辑后切换底部导航再返回，可以恢复普通资料草稿或在离开前明确选择放弃。

**09｜手机详情的返回操作离开目录**

复现：从首页进入探索，打开“凛”的详情，地址变为 `/explore?character=rin`；浏览器返回后直接到首页 `/`，没有先关闭详情。打开和关闭详情都用 `replace: true`，因此详情没有独立历史记录。

建议详情作为可返回的一层历史状态；处理直接打开详情链接时的关闭回退，并保留搜索、筛选与滚动位置。

定位：[useCharacterPreview.ts:21](/Users/andy/Desktop/yumei/client/src/hooks/useCharacterPreview.ts:21)。

验收：首页 → 探索 → 详情 → 返回时回到原目录；再次返回才回首页。

**10｜图片生成缺少与长耗时相匹配的任务界面**

文字聊天和视频已有持久任务与恢复机制。自拍／合照虽然持久预留额度、成功保存、失败退款，但图片调用仍在长 HTTP mutation 中等待；前端进行状态主要依赖本地 mutation。刷新后没有可重新识别的图片任务卡及独立状态读取入口，提交参数也没有对应的客户端幂等请求标识。

不能据此说刷新必然丢图：服务端仍可能完成并保存结果。问题是用户在等待期间缺少可确认的任务状态；额度较高时重新提交还可能形成第二个任务。本次没有调用真实图片服务复现重启或断线。

建议参照现有视频流程，接收后立即返回任务 ID；在会话或“生成”中展示排队、生成、完成、失败和额度结算状态，允许刷新后恢复查询，并保证同一提交重试不重复接收。

定位：[selfieGeneration.ts:158](/Users/andy/Desktop/yumei/server/selfieGeneration.ts:158)、[selfieGeneration.ts:176](/Users/andy/Desktop/yumei/server/selfieGeneration.ts:176)、[useChatController.tsx:562](/Users/andy/Desktop/yumei/client/src/features/chat/useChatController.tsx:562)。

**11｜更正单条记忆的副作用范围过大**

更正、删除一条记忆，都会推进整个角色的遗忘边界到目前最后一条消息，并删除旧对话回顾和派生索引。后续模型不再使用此前聊天上下文。其他已保存的长期记忆仍保留，界面历史也仍保留；不能将其描述成“所有记忆被删”。

这是为了防止旧信息复活而采取的明确设计，页面已经提示。产品代价是：用户只改猫名或一个偏好，其他尚未进入长期记忆的近期谈话也可能失去连续性。

建议近期保留这项隐私保障，但在操作前明确说明影响的是整个角色的旧聊天上下文，完成后提供重新建立当前话题的入口；后续再评估按事实来源处理遗忘的可行性。

定位：[memory.ts:1047](/Users/andy/Desktop/yumei/server/memory.ts:1047)、[memoryDerived.ts:75](/Users/andy/Desktop/yumei/server/memoryDerived.ts:75)、[zh-CN.ts:758](/Users/andy/Desktop/yumei/shared/locales/zh-CN.ts:758)。

**12｜多语界面尚未覆盖完整服务语义**

界面支持中英日韩，但自然语言自拍触发主要识别中文和英文；危机提示检测也只列出中英文模式。直接调用实际函数验证：英文自拍请求可识别，等义日文、韩文请求返回空；中英文危机表达中的已覆盖样例能触发，日文、韩文样例不触发专用提示。

这里不能推断模型会输出不安全回复：系统提示始终附加安全条款，仍有模型层保障。可确认的是，产品层的意图触发与专用提示在不同语言下不一致。

建议为每个已支持语言建立同一套关键用户旅程样例，包括发图、否定发图、修改记忆、危机提示和错误解释。操作按钮可继续作为确定性入口，自然语言能力的覆盖应有明确验收。

定位：[selfieRequest.ts:21](/Users/andy/Desktop/yumei/shared/selfieRequest.ts:21)、[safety.ts:3](/Users/andy/Desktop/yumei/shared/safety.ts:3)、[chatPrompt.ts:153](/Users/andy/Desktop/yumei/shared/chatPrompt.ts:153)。

**建议的调整顺序**

1. 先修 01、02、05、08、09：语音可用性、错误语义、时区、草稿和返回路径，都有明确且可检查的触发条件。
2. 面向正式 C 端开放前补 03；启用收费前补 04。把数据控制与付费管理做成用户可完成的流程。
3. 再做 06、07、10：精简首屏与创建流程，给生成任务一个稳定入口。
4. 对 11 做影响范围说明与后续方案评估，对 12 按实际发布语言验收。

建议手机主导航优先验证“发现／聊天／作品／我的”四个用户目的；把“创建”作为发现和角色管理里的动作。“生成”当前只是选角色后跳回聊天的中转页，可以与任务及作品入口一起重新组织。该导航建议属于产品假设，适合用小范围任务测试验证。

设置页建议先提供“声音、回复风格、外观、通知、隐私与账号”这些用户任务；服务商、模型价格、Key、系统提示词和实验玻璃效果进一步收起。当前语音配置放在正常设置中，仍直接展示供应商品牌和 Key 输入，对普通消费者的认知负担偏高。

**与后续 PRD 的方向差距**

README 明确说明 PRD v0.6 是后续目标，因此以下不是当前实现的故障：PRD 面向日本／台湾，并将女性与酷儿用户列为核心；当前默认角色库为女性角色，目录只有画风和关键词筛选；语言列表没有繁体中文，`zh-TW` 会匹配到简体中文。需要先决定下一阶段继续验证“自托管 AI 陪伴工具”，还是推进 PRD 中的多元角色与关系／剧情产品，再决定角色供给和信息架构投入。

工程侧还有一个后续优化点：本次生产构建通过，主 JS 约 1.16 MB，gzip 约 366 KB；公开配置接口返回包含提示词、工作流和服务地址的完整业务配置。建议拆出前台需要的公开投影并检查首包依赖。没有做弱网和真实设备性能测试，本次不据此断言页面卡顿。

**值得保留的基础**

服务端有年龄与归属校验；密钥采用加密存储；额度结算使用事务；文字流有停止、补发和刷新恢复；记忆来源、更正、遗忘和主动联系授权已有清晰约束。后续调整可以复用这些基础，重点补齐用户可理解、可操作的交付流程。

本轮仅新增走查文档。生产构建通过，保留现有包体提示；未运行完整回归测试，未把模拟上游验收当成真实供应商质量验收。
