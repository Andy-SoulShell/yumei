# 贡献指南

感谢你对 YUMEI 项目的关注！我们欢迎任何形式的贡献。

## 如何贡献

### 报告 Bug

如果你发现了 Bug，请通过当前 YUMEI 仓库的 Issue 跟踪器提交，并包含以下信息：

- Bug 的详细描述
- 复现步骤
- 期望行为 vs 实际行为
- 浏览器和设备信息
- 截图或录屏（如适用）

### 功能建议

欢迎通过当前 YUMEI 仓库的 Issue 跟踪器提交功能建议，请描述：

- 你希望实现的功能
- 使用场景和预期效果
- 是否愿意参与实现

### 提交代码

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/your-feature-name`
3. 提交更改：`git commit -m "feat: 添加xxx功能"`
4. 推送分支：`git push origin feature/your-feature-name`
5. 创建 Pull Request

## 开发环境搭建

```bash
# 进入你的 YUMEI 工作目录
cd /path/to/yumei

# 安装依赖
corepack enable
corepack pnpm install --frozen-lockfile

# 启动开发服务器
pnpm dev

# 类型、lint 和格式检查（不修改文件）
pnpm check

# 自动修复可修复的 lint 问题，再统一格式
pnpm lint:fix
pnpm format

# 运行测试
pnpm test
```

## 代码规范

### 提交信息格式

请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

| 前缀        | 用途                       |
| ----------- | -------------------------- |
| `feat:`     | 新功能                     |
| `fix:`      | Bug 修复                   |
| `docs:`     | 文档更新                   |
| `style:`    | 代码格式调整（不影响逻辑） |
| `refactor:` | 代码重构                   |
| `test:`     | 测试相关                   |
| `chore:`    | 构建/工具相关              |

### 代码风格

- 使用 TypeScript 严格模式
- 使用 `pnpm typecheck` 检查源码、测试、数据库 schema 和 TypeScript 配置
- 使用 ESLint 检查代码与 React Hooks：`pnpm lint`；自动修复：`pnpm lint:fix`
- 使用 Prettier 格式化代码：`pnpm format`
- 提交前运行 `pnpm check`，统一检查类型、lint 与格式；CI 同时执行生产构建
- 前端组件使用函数式组件 + Hooks
- 后端 API 使用 tRPC 过程定义
- 连接与用户事务锁位于 `server/database.ts`，数据操作按领域放入 `server/repositories/`；领域之间直接导入所需模块。
- tRPC 过程放入 `server/routers/`，`server/routers.ts` 只组合路由；页面状态与操作流程放入 `client/src/features/` 的控制器，展示区块消费控制器状态。
- 当前为开发阶段，不维护兼容层。允许删除过时接口、重建初始化迁移和重置开发库；表结构变更同步更新初始化 SQL、快照和真实数据库回归。

### 中文 TSDoc 注释

- 文件开头说明模块职责；导出的函数、类、组件、Hook 和核心业务逻辑使用 `/** ... */` 中文注释。
- 首句说明用途。参数含义不直观时写 `@param 名称 - 说明`；返回值有特殊语义时写 `@returns`；可预期的异常写 `@throws`；限制、权限、持久化和其他副作用写 `@remarks`。
- Props 和数据类型重点解释业务含义、单位、默认值以及 `null` 的含义，避免重复 TypeScript 已表达的类型。
- 内部简单变量、直观的事件转发无需逐项注释；普通 `//` 用于解释设计原因、兼容处理和边界情况。
- 注释必须描述实际行为，不能把计划中的修复写成已经保证的能力。逻辑变动时同步更新注释；审查问题记录在 [todo.md](todo.md)。
- `.env.example` 使用中文 `#` 注释，说明用途、必填条件、可选枚举、默认值、单位、留空效果，以及代码与 Docker Compose 的差异；示例中不得包含真实密钥。

```ts
/**
 * 按用户和 UTC 日期汇总当天用量。
 *
 * @param userId - 当前已认证用户的标识
 * @returns 当天的计量记录；没有记录时返回空数组。
 * @remarks 只读查询，不扣减额度。
 */
```

### 界面组件

- 页面和业务组件统一使用 `client/src/components/ui/`：普通操作用 `Button`，互斥选择用 `RadioGroup`，下拉选择用 `Select`，菜单用 `DropdownMenu`，折叠用 `Collapsible`。
- 搜索模型和音色复用 `SearchSelect`（Radix Popover + Command）；试听和收藏放在列表外，避免选项或按钮内嵌套其他交互控件。日期复用 `DatePicker`（Calendar + Popover）。上传和录音在业务层组合公共组件。
- 使用 `radix-ui` 统一包，保留 `components.json` 的 `new-york` 配置。新增组件先运行 `pnpm ui:add <组件名> --dry-run` 审查，再运行 `pnpm ui:add <组件名>`；如果 CLI 引入独立的 `@radix-ui/react-*` 包，运行 `pnpm ui:migrate -y`，确认无引用后移除冗余直接依赖。
- 不直接覆盖已定制的 `Button`、`Input`、`Textarea`、`Dialog`、`Command` 和主题变量；更新时核对差异，保留中文输入法保护、中英文文案、语义主题色、键盘导航和焦点恢复。
- `Button` 的 `plain` / `none` 组合用于图片入口及富内容操作行，仍保留统一的禁用和焦点样式；持续选择优先使用 RadioGroup，不把选择卡片统一包装成普通操作按钮。

### 测试要求

- 新增功能必须附带对应的测试用例
- 测试文件放在 `server/` 或 `client/` 目录下，命名为 `*.test.ts` 或 `*.test.tsx`
- 完整测试使用独立 MySQL 8 测试库，库名必须包含 `test`。本机先复制 `.env.test.example` 为 `.env.test.local`，填写两组测试专用密码及匹配的连接串，执行 `pnpm test:db:up`、`pnpm test:db:migrate`，再运行 `pnpm test`。基线改变时使用 `pnpm test:db:reset` 清除并重建测试库。测试命令自动读取测试配置，环境变量优先；CI 显式提供 `DATABASE_URL`。启动脚本只读取应用 `.env` 的数据库地址用于防止误连，不将应用密钥注入测试。
- 测试启动会检查数据库连通性及当前全部迁移的校验和；缺少配置、连不上或未迁移时直接失败，不能静默当作测试通过。
- CI 自动创建独立 MySQL，执行迁移、完整测试和上海时区通知回归；AI 和发信服务使用测试替身，不使用真实运营密钥。
- 回归测试必须调用实际业务函数、路由或 Hook，覆盖失败回滚、归属、并发和重试边界；不要复制实现到测试里再验证复制出的结果。

## 项目结构

请参阅 [README.md](README.md) 中的项目结构说明，了解各目录和文件的职责。

## 联系方式

如有任何问题，欢迎通过 GitHub Issues 联系我们。

## 新增界面语言

1. 在 `shared/locales/` 添加语言包，按 `en.ts` 的命名空间、语义 key 和插值参数翻译完整句子，并使用 `satisfies MessageCatalog` 校验覆盖范围。
2. 在 `shared/locales/index.ts` 导入语言包并增加一条 `LANGUAGES` 配置，填写语言自称、地区匹配前缀、date-fns 日历、语音语言及别名、字体和换行策略。语言选择器、偏好校验、系统识别、邮件和翻译资源会自动使用注册信息，不需要增加数据库枚举。

运行 `pnpm test:i18n` 检查所有注册语言的 key、非空文案、插值参数、回退行为、账号语言切换和本地化邮件。此命令不连接数据库；完整集成测试继续使用独立 MySQL 测试库。

`pnpm test:auth` 检查认证表单、桌面弹框、手机登录入口、回调地址及邮件模板，不连接数据库或真实发信服务。邮箱验证、密码重置、并发令牌消费和事务回滚等真实认证回归通过 `pnpm test server/auth.password.test.ts server/auth.session.test.ts` 在独立测试库执行。

业务组件使用 `t("chat:empty.start", { name })`，不要用原文作 key、拆句拼接或修改展示字符串来转换价格。key 与插值参数有类型检查；金额、相对时间和列表分别使用 `Intl.NumberFormat`、`Intl.RelativeTimeFormat` 和 `Intl.ListFormat`。

主题和记忆的显示文案通过 `client/src/locales/domain.ts` 关联稳定业务 ID。官方角色标签、轮播、FAQ、套餐、姿势和亲密度使用数据库中的多语言文案，通过公开 API 读取，缺少当前语言时回退中文；新增业务 ID 无需修改静态映射。套餐、姿势解锁和亲密度结算必须从同一发布业务配置读取，不能在前端再维护额度、等级或奖励常量。初始资料仅保存在 `server/seeds/`，不得在生产前端导入。用户资料、角色设定、聊天记录和 AI 回复保持原文；界面语言不改变 AI 回复语言。系统通知保存 `{ key, values }`，显示或推送时才渲染。新增本地化业务错误应传结构化原因和参数，不要在错误正文中编码前缀。

当前开发阶段直接使用新表结构：通知标题和正文在初始建表时使用 JSON，账号语言在建表时使用 varchar(35)。不保留旧文案兼容层。已有开发库需要清空后重新迁移。
