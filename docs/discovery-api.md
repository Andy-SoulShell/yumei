# 官方角色与首页内容 API

官方角色、首页精选、轮播和 FAQ 使用 MySQL 数据，前端通过 `discovery.get` 获取当前发布快照。初始化内容位于 `server/seeds/`，仅在新库首次启动时导入；此后更新种子文件或重启进程不会覆盖数据库中的运营编辑。

当前开发阶段只维护 `drizzle/0000_init.sql` 新库初始化基线，不提供旧数据库迁移或角色来源回填。

## 接口

所有业务接口位于 `/api/trpc`，使用项目现有的 tRPC、SuperJSON 和账号会话。管理员接口要求当前账号 `role=admin`；写请求同时携带登录 Cookie、`csrf_token` Cookie 及匹配的 `x-csrf-token` 请求头。前端现有 tRPC 客户端已处理会话和 CSRF。

| 过程                               | 权限     | 输入和作用                                                                         |
| ---------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `discovery.get`                    | 公开     | 无输入；返回已发布的 `characters`、`home`、`revision`、`publishedAt`               |
| `discovery.admin.getDraft`         | 管理员   | 返回草稿 `revision`、`home`、角色记录及归档状态                                    |
| `discovery.admin.saveCharacter`    | 管理员   | `{ expectedRevision, character }`；新增或完整替换角色草稿，也可恢复已归档角色      |
| `discovery.admin.archiveCharacter` | 管理员   | `{ expectedRevision, id }`；标记角色草稿归档，保留稳定 ID                          |
| `discovery.admin.saveHomepage`     | 管理员   | `{ expectedRevision, home }`；完整替换首页配置                                     |
| `discovery.admin.uploadImage`      | 管理员   | `{ imageBase64 }`；上传公开图片，返回可填入角色或轮播的 `imageUrl` 和 `mimeType`   |
| `discovery.admin.publish`          | 管理员   | `{ expectedRevision }`；校验全部资料和引用后原子发布                               |
| `girlfriend.createFromPreset`      | 登录用户 | `{ presetId }`；由服务端读取当前发布的人设并创建，按账号和预设 ID 原子复用已有角色 |

`revision` 是并发编辑令牌，每次保存或发布返回新的值。它只用于避免覆盖其他管理员的修改，不承担旧版本兼容；读取后若收到 `CONFLICT`，重新读取草稿、合并编辑，再提交。公开快照与草稿分别保存，游客看不到未发布的编辑。

## 编辑与发布示例

以下代码中的 `api` 表示已按上述账号会话和 CSRF 配置的 tRPC 客户端，类型为项目 `AppRouter`。

```ts
let draft = await api.discovery.admin.getDraft.query();
const character = draft.characters.find(row => row.id === "xiaotao")!.data;

const characterSave = await api.discovery.admin.saveCharacter.mutate({
  expectedRevision: draft.revision,
  character: {
    ...character,
    label: { ...character.label, "zh-CN": "今天的主推角色" },
  },
});

const homepageSave = await api.discovery.admin.saveHomepage.mutate({
  expectedRevision: characterSave.revision,
  home: {
    ...draft.home,
    featuredIds: ["xiaotao", "rin"],
    faqs: [
      {
        id: "new-question",
        question: {
          "zh-CN": "这里可以填写新问题吗？",
          en: "Can I add a question?",
        },
        answer: { "zh-CN": "可以，发布后首页直接读取新文案。" },
      },
    ],
  },
});

await api.discovery.admin.publish.mutate({
  expectedRevision: homepageSave.revision,
});
```

## 角色字段与来源关联

`character` 的完整结构由 `shared/discovery.ts` 校验：

- `id`：稳定 ID，匹配 `[a-z][a-z0-9_-]{0,99}`。修改名称、人设或图片时保留 ID；使用新 ID 表示新增角色。
- `name`、`age`、`style`：姓名、成年年龄（18–120）和 `realistic` / `anime`。
- `label`、`tagline`：按 `zh-CN` / `en` / `ja` / `ko` 保存的文案对象，必须提供中文；其他语言缺失时回退中文。
- `personality`、`appearance`、`interests`、`behavior`：角色资料与完整行为配置，创建后成为用户角色自己的资料。
- `imageUrl`：已有 `/characters/...` 图片，或 `uploadImage` 返回的 `/files/official-...` 路径。不能引用任意文件或外部 URL。
- `listed`：是否进入探索列表和创建页选择器；默认 YUMEI 初始为 `false`，由 `home.defaultPresetId` 指定。
- `sortOrder`：目录排序值，相同值按 ID 排序。

新增、定制和默认角色创建时均保存 `girlfriends.officialPresetId`。直接上传照片从零创建的角色为 `null`。用户编辑资料不改变来源 ID，更新或归档官方角色不会覆盖其已保存的人设、行为、图片、记忆或聊天。

官方聊天入口通过 `girlfriend.createFromPreset` 原子复用同账号、同来源 ID 的未删除角色，复用发生在套餐数量检查之前；多次点击和并发请求不会额外创建角色。定制创建接口 `girlfriend.create` 仍可主动创建多个不同的定制版本。

## 首页配置

- `defaultPresetId`：必须引用一个未归档的官方角色。
- `featuredIds`：按数组顺序展示，不能重复，且必须引用 `listed=true` 的未归档角色。
- `pageSize`：探索页每批显示数量，1–100。
- `homeCharacterLimit`：首页目录显示数量，0–100，0 时隐藏此模块。
- `carouselIntervalMs`：轮播切换间隔，3000–60000 毫秒。
- `slides`：按数组顺序展示，包含稳定 `id`、多语言 `title` / `highlight` / `action`、本站 `href` 及 1–3 张 `images`；空数组隐藏轮播。
- `faqs`：按数组顺序展示，包含稳定 `id` 和多语言 `question` / `answer`；空数组隐藏 FAQ。

移除精选、轮播或 FAQ 时直接提交删去对应项的新数组。下架角色先调用归档接口，再从首页精选中移除相应 ID；归档默认角色前也需要更换 `defaultPresetId`。发布验证失败会保留上一发布快照，草稿仍可继续修正。

## 图片与前端同步

图片上传检查真实文件签名，最大 10MB，支持 JPEG、PNG、GIF、WebP。官方图片公开可读并长期保留，避免草稿、已发布内容或多人编辑引用的图片被自动回收。不要上传私人媒体；当前没有自动清理未引用官方图片的接口。

服务端每次公开查询直接读取当前发布快照。前端刷新和重新聚焦时按缓存策略重新查询，打开的页面每 60 秒同步一次；不需要重新构建或重启服务。请求失败时显示重试入口，不回退到源码中的初始内容。新角色 ID 和新运营文案直接渲染，无需新增静态翻译键。
