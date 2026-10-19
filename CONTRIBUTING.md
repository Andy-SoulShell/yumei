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
pnpm install --frozen-lockfile

# 启动开发服务器
pnpm dev

# 类型、lint 和格式检查（不修改文件）
pnpm check

# 自动修复可修复的 lint 问题，再统一格式
pnpm lint:fix
pnpm format

# 运行测试
TZ=UTC pnpm test
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
- 数据库操作封装在 `server/db.ts` 中

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

### 测试要求

- 新增功能必须附带对应的测试用例
- 测试文件放在 `server/` 或 `client/` 目录下，命名为 `*.test.ts` 或 `*.test.tsx`
- 完整测试需通过环境变量提供已应用迁移的专用测试库 `DATABASE_URL`，并用 `TZ=UTC pnpm test` 执行

## 项目结构

请参阅 [README.md](README.md) 中的项目结构说明，了解各目录和文件的职责。

## 联系方式

如有任何问题，欢迎通过 GitHub Issues 联系我们。
