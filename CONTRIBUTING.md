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
corepack pnpm install --frozen-lockfile

# 启动开发服务器
pnpm dev

# 运行测试
pnpm test
```

## 代码规范

### 提交信息格式

请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

| 前缀 | 用途 |
|------|------|
| `feat:` | 新功能 |
| `fix:` | Bug 修复 |
| `docs:` | 文档更新 |
| `style:` | 代码格式调整（不影响逻辑） |
| `refactor:` | 代码重构 |
| `test:` | 测试相关 |
| `chore:` | 构建/工具相关 |

### 代码风格

- 使用 TypeScript 严格模式
- 使用 Prettier 格式化代码：`pnpm format`
- 前端组件使用函数式组件 + Hooks
- 后端 API 使用 tRPC 过程定义
- 数据库操作封装在 `server/db.ts` 中

### 测试要求

- 新增功能必须附带对应的测试用例
- 测试文件放在 `server/` 目录下，命名为 `*.test.ts`
- 确保所有测试通过后再提交 PR：`pnpm test`

## 项目结构

请参阅 [README.md](README.md) 中的项目结构说明，了解各目录和文件的职责。

## 联系方式

如有任何问题，欢迎通过 GitHub Issues 联系我们。
