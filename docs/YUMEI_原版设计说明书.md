# YUMEI — 智能虚拟女友聊天应用 软件设计说明书

> 本文沿用迁移前项目 v2.3.1 的设计说明，用于历史参考；当前运行配置以 [README](../README.md)、[`.env.example`](../.env.example) 和源码为准，后续产品方向见 [PRD v0.6](亚洲版成人AI角色陪伴产品_PRD_v0.6.md)。

**版本：** v2.3.1  
**最后更新：** 2026 年 2 月 21 日  
**作者：** 大韦哥 & Manus AI

---

## 目录

1. [项目概述](#1-项目概述)
2. [需求分析](#2-需求分析)
3. [系统架构](#3-系统架构)
4. [技术栈](#4-技术栈)
5. [数据库设计](#5-数据库设计)
6. [功能模块详解](#6-功能模块详解)
7. [API 接口文档](#7-api-接口文档)
8. [前端页面结构](#8-前端页面结构)
9. [安全与认证](#9-安全与认证)
10. [使用说明](#10-使用说明)
11. [版本迭代历史](#11-版本迭代历史)
12. [未来规划](#12-未来规划)

---

## 1. 项目概述

**YUMEI** 是一款基于大语言模型（LLM）的智能虚拟女友聊天应用。用户可以创建具有独特性格、外貌和兴趣爱好的虚拟女友角色，与之进行自然语言对话，并通过 AI 图像生成技术获取女友的"自拍照片"。应用支持多女友管理、心情系统、语音合成（TTS）、推送通知等丰富功能，同时提供 PWA 渐进式 Web 应用体验，可安装到移动设备主屏幕使用。

### 1.1 产品定位

YUMEI 定位为一款面向个人用户的 AI 陪伴型应用。它不仅是一个简单的聊天机器人，而是通过角色定制、情感系统、视觉生成和语音交互等多维度体验，构建出具有情感深度的虚拟伴侣关系。用户可以根据自己的喜好自由定义女友的性格特征、外貌描述和行为模式，获得高度个性化的交互体验。

### 1.2 核心价值

YUMEI 的核心价值体现在三个层面：**个性化定制**允许用户从性格、外貌到对话风格全方位塑造理想的虚拟伴侣；**多模态交互**整合了文本对话、AI 自拍生成和语音合成三种交互方式，提供沉浸式体验；**情感陪伴**通过心情系统和主动通知机制，让虚拟女友具备"情感温度"，能够根据互动频率主动发起关怀。

---

## 2. 需求分析

### 2.1 功能性需求

YUMEI 的功能性需求可以划分为以下六大模块，每个模块承担不同的业务职责：

| 模块 | 核心需求 | 优先级 |
|------|---------|--------|
| 女友管理 | 创建、编辑、删除、切换多个虚拟女友角色；支持头像上传和参考图片 | P0 |
| 智能对话 | 基于 LLM 的自然语言对话，支持上下文记忆和角色一致性 | P0 |
| 自拍生成 | 基于 fal.ai 的 AI 图像编辑，根据对话场景自动或手动生成自拍 | P1 |
| 语音合成 | 支持浏览器内置 TTS、ElevenLabs 和 Fish Audio 三种语音方案 | P1 |
| 心情系统 | 根据聊天内容和频率动态计算女友心情状态 | P2 |
| 推送通知 | 女友主动发送问候、想念等通知消息 | P2 |

### 2.2 非功能性需求

在非功能性需求方面，应用需要满足以下标准：**响应式设计**确保在桌面端和移动端均有良好的使用体验；**PWA 支持**使应用可安装到设备主屏幕，支持离线缓存和全屏运行；**数据安全**通过 OAuth 认证和用户数据隔离保障隐私；**可扩展性**通过模块化架构支持后续功能扩展。

### 2.3 用户角色

应用设计了两种用户角色。**普通用户（user）** 拥有完整的女友管理、对话、自拍和设置功能权限。**管理员（admin）** 在普通用户权限基础上，拥有系统级管理能力。角色通过数据库 `users` 表的 `role` 字段区分，项目 Owner 自动获得 admin 角色。

---

## 3. 系统架构

### 3.1 整体架构

YUMEI 采用前后端分离的单体应用架构，前端和后端代码共存于同一代码仓库中，通过 Vite 开发服务器实现统一的开发体验。生产环境下，前端构建为静态资源由 Express 服务器托管，后端 API 通过 tRPC 协议提供类型安全的远程过程调用。

```
┌─────────────────────────────────────────────────────┐
│                    客户端（浏览器）                     │
│  React 19 + Tailwind CSS 4 + shadcn/ui + wouter     │
│  tRPC Client + TanStack React Query                  │
└────────────────────┬────────────────────────────────┘
                     │ HTTP / tRPC (JSON + Superjson)
                     ▼
┌─────────────────────────────────────────────────────┐
│                 服务端（Express 4）                    │
│  tRPC Server + Zod 验证 + JWT 会话                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │ LLM API  │ │ fal.ai   │ │ TTS API  │             │
│  │(内置/OR) │ │ 图像生成  │ │(EL/Fish) │             │
│  └──────────┘ └──────────┘ └──────────┘             │
└────────┬──────────────┬─────────────────────────────┘
         │              │
         ▼              ▼
┌──────────────┐  ┌──────────────┐
│  MySQL/TiDB  │  │  AWS S3      │
│  (数据持久化) │  │  (文件存储)   │
└──────────────┘  └──────────────┘
```

### 3.2 通信协议

前后端通信采用 **tRPC** 协议，这是一种端到端类型安全的 RPC 框架。所有 API 调用通过 `/api/trpc` 路径路由，使用 Superjson 序列化以保留 JavaScript 原生类型（如 `Date` 对象）。前端通过 `trpc.*.useQuery()` 和 `trpc.*.useMutation()` 直接调用后端过程，无需手动编写 REST 接口或类型定义。

### 3.3 文件存储策略

所有用户上传的文件（参考图片、头像、自拍照片、语音文件）均存储在 AWS S3 对象存储中。数据库仅保存文件的 URL 和 S3 Key 作为引用，不存储文件二进制数据。这种设计确保了数据库的轻量化和文件访问的高性能。

---

## 4. 技术栈

### 4.1 前端技术

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.2 | UI 框架，使用函数组件和 Hooks |
| TypeScript | 5.9 | 类型安全的 JavaScript 超集 |
| Tailwind CSS | 4.1 | 原子化 CSS 框架，使用 OKLCH 色彩空间 |
| shadcn/ui | — | 基于 Radix UI 的组件库（Button、Card、Dialog、Select 等） |
| wouter | 3.3 | 轻量级路由库 |
| TanStack React Query | 5.90 | 服务端状态管理和数据缓存 |
| tRPC React | 11.6 | 类型安全的 API 调用客户端 |
| Framer Motion | 12.23 | 动画库，用于页面过渡和微交互 |
| Lucide React | 0.453 | 图标库 |
| Sonner | 2.0 | Toast 通知组件 |
| Streamdown | 1.4 | Markdown 流式渲染组件 |

### 4.2 后端技术

| 技术 | 版本 | 用途 |
|------|------|------|
| Express | 4.21 | HTTP 服务器框架 |
| tRPC Server | 11.6 | 类型安全的 RPC 服务端 |
| Drizzle ORM | 0.44 | 类型安全的数据库 ORM |
| Zod | 4.1 | 运行时数据验证 |
| Jose | 6.1 | JWT 令牌签发与验证 |
| Axios | 1.12 | HTTP 客户端，用于调用外部 API |
| Nanoid | 5.1 | 唯一 ID 生成器 |
| Superjson | 1.13 | 序列化库，保留 Date 等原生类型 |

### 4.3 基础设施

| 组件 | 说明 |
|------|------|
| 数据库 | MySQL / TiDB（通过 `DATABASE_URL` 环境变量配置） |
| 文件存储 | AWS S3（通过 `@aws-sdk/client-s3` 访问） |
| 认证 | Manus OAuth 2.0（JWT 会话 Cookie） |
| 构建工具 | Vite 7.1（前端）+ esbuild（后端） |
| 包管理 | pnpm 10.4 |
| 测试框架 | Vitest 2.1（85 个测试用例） |

### 4.4 外部 API 集成

| 服务 | 用途 | 配置方式 |
|------|------|---------|
| 内置 LLM API | 默认对话引擎 | 平台自动注入，无需用户配置 |
| OpenRouter | 可选的 LLM 服务，支持数百种模型 | 用户在设置页输入 API Key |
| fal.ai (Grok Imagine) | AI 自拍图像生成 | 用户在设置页输入 API Key |
| ElevenLabs | 高质量语音合成 | 用户在设置页输入 API Key 并选择声音 |
| Fish Audio | 中文优化语音合成 | 用户在设置页输入 API Key 并选择声音模型 |

---

## 5. 数据库设计

### 5.1 实体关系概览

YUMEI 的数据库包含 8 张核心数据表，它们之间的关系如下：一个用户（`users`）可以拥有多个女友（`girlfriends`），每个女友可以有多个对话（`conversations`），每个对话包含多条消息（`messages`）。自拍照片（`selfies`）关联到用户和女友。心情记录（`girlfriendMoods`）和通知（`notifications`）同样关联到用户和女友。API 配置（`apiConfigs`）与用户一对一关联。

### 5.2 数据表结构

#### 5.2.1 users — 用户表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 用户 ID |
| openId | VARCHAR(64) | UNIQUE, NOT NULL | OAuth 唯一标识 |
| name | TEXT | — | 用户名 |
| email | VARCHAR(320) | — | 邮箱 |
| loginMethod | VARCHAR(64) | — | 登录方式 |
| role | ENUM('user','admin') | DEFAULT 'user' | 角色 |
| createdAt | TIMESTAMP | DEFAULT NOW | 创建时间 |
| updatedAt | TIMESTAMP | ON UPDATE NOW | 更新时间 |
| lastSignedIn | TIMESTAMP | DEFAULT NOW | 最后登录时间 |

#### 5.2.2 girlfriends — 女友配置表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 女友 ID |
| userId | INT | NOT NULL | 所属用户 ID |
| name | VARCHAR(100) | NOT NULL | 女友名称 |
| personality | TEXT | NOT NULL | 性格描述（用于 LLM 系统提示词） |
| appearance | TEXT | NOT NULL | 外貌描述（用于图片生成） |
| interests | TEXT | — | 兴趣爱好 |
| referenceImageUrl | TEXT | NOT NULL | 参考图片 URL（S3） |
| referenceImageKey | VARCHAR(500) | NOT NULL | 参考图片 S3 Key |
| customPrompt | TEXT | — | 个体定制提示词（最多 300 字） |
| avatarUrl | TEXT | — | 头像图片 URL（S3） |
| avatarKey | VARCHAR(500) | — | 头像 S3 Key |
| isActive | BOOLEAN | DEFAULT true | 是否为当前激活女友 |
| deletedAt | TIMESTAMP | — | 软删除时间（null 表示未删除） |
| createdAt | TIMESTAMP | DEFAULT NOW | 创建时间 |
| updatedAt | TIMESTAMP | ON UPDATE NOW | 更新时间 |

#### 5.2.3 conversations — 对话会话表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 对话 ID |
| userId | INT | NOT NULL | 所属用户 ID |
| girlfriendId | INT | NOT NULL | 关联女友 ID |
| title | VARCHAR(200) | — | 对话标题 |
| createdAt | TIMESTAMP | DEFAULT NOW | 创建时间 |
| updatedAt | TIMESTAMP | ON UPDATE NOW | 更新时间 |

#### 5.2.4 messages — 消息表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 消息 ID |
| conversationId | INT | NOT NULL | 所属对话 ID |
| role | ENUM('user','assistant') | NOT NULL | 消息角色 |
| content | TEXT | NOT NULL | 文本内容 |
| imageUrl | TEXT | — | 图片消息 URL |
| imageKey | VARCHAR(500) | — | 图片 S3 Key |
| selfieMode | ENUM('mirror','direct') | — | 自拍模式 |
| createdAt | TIMESTAMP | DEFAULT NOW | 创建时间 |

#### 5.2.5 selfies — 自拍照片表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 自拍 ID |
| userId | INT | NOT NULL | 所属用户 ID |
| girlfriendId | INT | NOT NULL | 关联女友 ID |
| messageId | INT | — | 关联消息 ID |
| imageUrl | TEXT | NOT NULL | 图片 URL（S3） |
| imageKey | VARCHAR(500) | NOT NULL | S3 Key |
| prompt | TEXT | NOT NULL | 生成使用的完整提示词 |
| userContext | TEXT | NOT NULL | 用户的场景描述 |
| mode | ENUM('mirror','direct') | NOT NULL | 自拍模式 |
| createdAt | TIMESTAMP | DEFAULT NOW | 创建时间 |

#### 5.2.6 apiConfigs — API 配置表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 配置 ID |
| userId | INT | UNIQUE, NOT NULL | 所属用户 ID（一对一） |
| falApiKey | VARCHAR(200) | — | fal.ai API Key |
| llmApiKey | VARCHAR(200) | — | OpenRouter API Key |
| llmApiUrl | VARCHAR(500) | — | LLM API URL |
| llmModel | VARCHAR(200) | — | 选择的模型 ID |
| ttsProvider | ENUM('browser','elevenlabs','fishaudio') | DEFAULT 'browser' | 语音提供商 |
| elevenlabsApiKey | VARCHAR(200) | — | ElevenLabs API Key |
| elevenlabsVoiceId | VARCHAR(200) | — | ElevenLabs 声音 ID |
| elevenlabsVoiceName | VARCHAR(200) | — | ElevenLabs 声音名称 |
| fishAudioApiKey | VARCHAR(200) | — | Fish Audio API Key |
| fishAudioModelId | VARCHAR(200) | — | Fish Audio 模型 ID |
| fishAudioModelName | VARCHAR(200) | — | Fish Audio 模型名称 |
| globalPrompt | TEXT | — | 全局默认提示词 |
| replyLanguage | VARCHAR(50) | DEFAULT '中文' | 回复语言 |
| replyLengthLimit | VARCHAR(50) | DEFAULT '50-100字' | 回复长度限制 |
| createdAt | TIMESTAMP | DEFAULT NOW | 创建时间 |
| updatedAt | TIMESTAMP | ON UPDATE NOW | 更新时间 |

#### 5.2.7 girlfriendMoods — 心情追踪表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 记录 ID |
| userId | INT | NOT NULL | 所属用户 ID |
| girlfriendId | INT | NOT NULL | 关联女友 ID |
| mood | ENUM(6 种状态) | DEFAULT 'happy' | 心情状态 |
| moodScore | INT | DEFAULT 70 | 心情分数（0-100） |
| lastChatAt | TIMESTAMP | — | 最后聊天时间 |
| totalMessages | INT | DEFAULT 0 | 累计消息数 |
| todayMessages | INT | DEFAULT 0 | 今日消息数 |
| lastMoodUpdate | TIMESTAMP | DEFAULT NOW | 最后心情更新时间 |
| createdAt | TIMESTAMP | DEFAULT NOW | 创建时间 |
| updatedAt | TIMESTAMP | ON UPDATE NOW | 更新时间 |

心情状态枚举值与对应分数区间如下：

| 心情状态 | 英文标识 | 分数区间 |
|---------|---------|---------|
| 兴奋 | excited | 90-100 |
| 开心 | happy | 70-89 |
| 满足 | content | 50-69 |
| 平静 | neutral | 30-49 |
| 孤独 | lonely | 15-29 |
| 难过 | sad | 0-14 |

#### 5.2.8 notifications — 通知表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 通知 ID |
| userId | INT | NOT NULL | 所属用户 ID |
| girlfriendId | INT | NOT NULL | 关联女友 ID |
| title | VARCHAR(200) | NOT NULL | 通知标题 |
| content | TEXT | NOT NULL | 通知内容 |
| type | ENUM(5 种类型) | DEFAULT 'random' | 通知类型 |
| isRead | BOOLEAN | DEFAULT false | 是否已读 |
| createdAt | TIMESTAMP | DEFAULT NOW | 创建时间 |

通知类型包括：`miss_you`（想你了）、`good_morning`（早安）、`good_night`（晚安）、`random`（随机消息）、`mood`（心情分享）。

---

## 6. 功能模块详解

### 6.1 女友管理模块

女友管理是 YUMEI 的基础模块，提供完整的 CRUD 操作。用户首次登录时，系统会自动创建一个名为 **YUMEI** 的默认女友角色，该角色拥有预设的性格（活泼开朗、充满好奇心）、外貌（紫色长发、紫色眼睛、猫耳发饰）和兴趣爱好（游戏、动漫、音乐等）。

**创建女友**时，用户需要填写名称、性格描述、外貌描述，并上传一张参考图片（用于后续的 AI 自拍生成）。系统将参考图片上传到 S3 存储，并在数据库中记录 URL 和 Key。

**编辑女友**支持修改所有配置字段，包括上传自定义头像照片。头像上传支持 JPG、PNG、GIF、WebP 四种格式，文件大小限制为 10MB。上传的头像会在首页卡片和聊天页面优先展示。

**删除机制**采用软删除策略：删除操作仅设置 `deletedAt` 时间戳，女友数据进入回收站保留 7 天。在此期间用户可以随时恢复。超过 7 天后，系统自动执行永久删除，级联清除所有关联的对话、消息、自拍和心情记录。此外，系统还支持批量选择和批量删除操作。

**激活机制**确保同一时间只有一个女友处于激活状态。当用户切换女友时，系统自动将之前的女友设为非激活，将新选择的女友设为激活。

### 6.2 智能对话模块

智能对话是 YUMEI 的核心交互模块，基于大语言模型实现自然、有情感的角色扮演对话。

**提示词分层架构**是对话质量的关键。系统采用三层提示词拼接策略：

1. **基础层（角色定义）**：包含女友的名称、性格特征、外貌特征和兴趣爱好，构成角色的基本人设。
2. **全局层（行为规范）**：用户在设置页配置的全局提示词，适用于所有女友。包括回复语言、回复长度限制和自定义行为规范。系统提供 6 个快捷模板（如"温柔体贴"、"活泼俏皮"等）供用户快速选用。
3. **个体层（专属指令）**：每个女友可以设置独立的定制提示词（最多 300 字），用于精细调整该角色的特殊行为。

**上下文管理**方面，系统在每次对话时获取最近 10 条消息作为上下文，确保对话的连贯性。消息历史按时间正序排列，传递给 LLM 时包含完整的角色-用户交替对话记录。

**LLM 调用策略**支持双通道：当用户配置了 OpenRouter API Key 时，优先使用 OpenRouter 调用用户选择的模型（如 GPT-4o、Claude 等）；未配置时，回退到平台内置的 LLM API。两种通道均有完善的错误处理，当 API 调用失败时返回友好的降级回复。

**自拍触发判断**在每次 AI 回复后自动执行。系统通过关键词匹配（如"照片"、"自拍"、"看看"、"穿"、"在哪"、"在干嘛"等）判断当前对话是否适合生成自拍，并将判断结果返回给前端。

### 6.3 自拍生成模块

自拍生成模块利用 fal.ai 的 Grok Imagine Image Edit API，基于用户上传的参考图片和对话上下文生成 AI 自拍照片。

**提示词工程**是自拍质量的核心。系统实现了基于 Clawra 项目的智能提示词模板系统，支持两种自拍模式：

- **Mirror 模式（镜子自拍）**：适用于服装展示、全身照等场景。当用户描述中包含 outfit、wearing、dress 等关键词时自动触发。生成的提示词强调"镜子自拍"特征。
- **Direct 模式（直接自拍）**：适用于地点拍摄、面部特写等场景。当用户描述中包含 cafe、beach、smile 等关键词时自动触发。生成的提示词强调"直接眼神接触"和自然角度。

系统通过 `buildSmartPrompt()` 函数自动检测用户输入的关键词，智能选择最合适的模式并构建完整的英文提示词。

**生成流程**为：构建提示词 → 调用 fal.ai API（传入参考图片 URL 和提示词）→ 下载生成的图片 → 上传到 S3 → 保存自拍记录到数据库 → 在对话中创建图片消息。

用户也可以通过聊天界面的"拍照"按钮手动触发自拍生成，支持自定义场景描述或使用默认的随意自拍。

### 6.4 语音合成模块

语音合成模块为 AI 女友的回复提供语音播放能力，支持三种方案：

**浏览器内置 TTS（免费）** 使用 Web Speech API，无需任何配置即可使用。优点是零成本，缺点是声音质量和自然度有限，且不同浏览器的声音效果存在差异。

**ElevenLabs** 是一款专业的 AI 语音合成服务，以其高度自然的语音质量著称。用户配置 API Key 后，系统会自动加载可用的声音列表（含分类和试听功能）。生成的语音文件（MP3 格式）上传到 S3 存储后返回播放 URL。使用的模型为 `eleven_multilingual_v2`，支持多语言。

**Fish Audio** 是一款对中文语音优化的 AI 语音合成服务。配置方式类似 ElevenLabs，支持搜索和标签筛选声音模型。使用 `s1` 模型生成 MP3 格式语音。

聊天界面支持语音自动播放和手动播放切换，以及 0.5x 到 2x 的播放速度调节。

### 6.5 心情系统

心情系统为每个女友维护一个动态的情感状态，通过量化的心情分数（0-100）和六种心情标签来表达。

**心情计算逻辑**在每次消息发送后触发，综合考虑以下因素：

- **基础互动加分**：用户每发送一条消息，心情分数增加 2 分（表示"在乎"）。
- **情感关键词**：消息中包含积极关键词（如"爱"、"喜欢"、"开心"、"抱抱"等 26 个中英文关键词）加 3 分；包含消极关键词（如"生气"、"无聊"、"分手"等 18 个关键词）扣 5 分。
- **聊天频率加成**：今日消息数达到 10 条加 1 分，达到 20 条加 2 分。
- **时间衰减**：超过 24 小时未聊天扣 5 分，超过 48 小时扣 10 分。

心情分数被限制在 0-100 范围内，并映射到六种心情状态。心情状态在首页女友卡片和聊天页面顶栏中可视化展示。

### 6.6 推送通知模块

推送通知模块让女友能够主动向用户发送消息，增强陪伴感。

**通知类型**包括五种：想你了（miss_you）、早安（good_morning）、晚安（good_night）、随机消息（random）和心情分享（mood）。每种类型预设了多条模板消息，系统随机选取以避免重复。

**触发逻辑**由前端定时调用 `checkProactive` 接口实现。系统随机选择一个女友，检查最近是否已发过通知（至少间隔 2 小时），然后根据当前时间和心情状态选择合适的消息类型：早上 6-8 点发送早安，晚上 22 点至凌晨 1 点发送晚安，心情分数低于 40 时发送想念消息，其他时间随机选择。

前端通过顶栏的铃铛图标展示未读通知数量，点击可查看通知列表，支持单条已读和全部已读操作。

---

## 7. API 接口文档

YUMEI 的所有 API 接口通过 tRPC 协议暴露，路径统一为 `/api/trpc`。以下按模块列出所有可用的过程（Procedure）：

### 7.1 认证接口

| 过程名 | 类型 | 权限 | 说明 |
|--------|------|------|------|
| `auth.me` | Query | Public | 获取当前登录用户信息 |
| `auth.logout` | Mutation | Public | 退出登录，清除会话 Cookie |

### 7.2 女友管理接口

| 过程名 | 类型 | 权限 | 输入参数 | 说明 |
|--------|------|------|---------|------|
| `girlfriend.create` | Mutation | Protected | name, personality, appearance, interests?, referenceImageBase64, referenceImageMimeType | 创建女友 |
| `girlfriend.getActive` | Query | Protected | — | 获取当前激活的女友 |
| `girlfriend.list` | Query | Protected | — | 获取所有女友列表 |
| `girlfriend.update` | Mutation | Protected | id, name?, personality?, appearance?, interests?, customPrompt?, isActive?, avatarUrl?, avatarKey? | 更新女友配置 |
| `girlfriend.uploadAvatar` | Mutation | Protected | girlfriendId, imageBase64, mimeType | 上传头像（限 10MB） |
| `girlfriend.delete` | Mutation | Protected | id | 软删除（移入回收站） |
| `girlfriend.batchDelete` | Mutation | Protected | ids[] | 批量软删除 |
| `girlfriend.trash` | Query | Protected | — | 获取回收站列表 |
| `girlfriend.restore` | Mutation | Protected | id | 从回收站恢复 |
| `girlfriend.permanentDelete` | Mutation | Protected | id | 永久删除 |
| `girlfriend.ensureDefault` | Mutation | Protected | — | 确保默认女友存在 |

### 7.3 对话管理接口

| 过程名 | 类型 | 权限 | 输入参数 | 说明 |
|--------|------|------|---------|------|
| `conversation.create` | Mutation | Protected | girlfriendId, title? | 创建新对话 |
| `conversation.list` | Query | Protected | — | 获取对话列表 |
| `conversation.listWithDetails` | Query | Protected | — | 获取对话列表（含最后消息和女友信息） |
| `conversation.get` | Query | Protected | id | 获取单个对话 |
| `conversation.getMessages` | Query | Protected | conversationId | 获取对话消息列表 |
| `conversation.search` | Query | Protected | keyword | 按关键词搜索对话 |

### 7.4 聊天接口

| 过程名 | 类型 | 权限 | 输入参数 | 说明 |
|--------|------|------|---------|------|
| `chat.sendMessage` | Mutation | Protected | conversationId, content | 发送消息并获取 AI 回复 |

返回值包含 `userMessage`（用户消息）、`assistantMessage`（AI 回复）和 `shouldGenerateSelfie`（是否建议生成自拍）。

### 7.5 自拍接口

| 过程名 | 类型 | 权限 | 输入参数 | 说明 |
|--------|------|------|---------|------|
| `selfie.generate` | Mutation | Protected | conversationId, userContext | 生成自拍照片 |
| `selfie.list` | Query | Protected | — | 获取所有自拍列表 |
| `selfie.listByGirlfriend` | Query | Protected | girlfriendId | 获取指定女友的自拍列表 |
| `selfie.delete` | Mutation | Protected | id | 删除自拍 |

### 7.6 API 配置接口

| 过程名 | 类型 | 权限 | 说明 |
|--------|------|------|------|
| `apiConfig.get` | Query | Protected | 获取当前 API 配置 |
| `apiConfig.upsert` | Mutation | Protected | 创建或更新 API 配置 |
| `apiConfig.fetchElevenLabsVoices` | Query | Protected | 查询 ElevenLabs 声音列表 |
| `apiConfig.fetchFishAudioModels` | Query | Protected | 查询 Fish Audio 模型列表 |
| `apiConfig.fetchModels` | Query | Protected | 查询 OpenRouter 可用模型列表 |

### 7.7 心情与通知接口

| 过程名 | 类型 | 权限 | 说明 |
|--------|------|------|------|
| `mood.get` | Query | Protected | 获取指定女友心情 |
| `mood.getAll` | Query | Protected | 获取所有女友心情 |
| `mood.update` | Mutation | Protected | 更新心情（发送消息后调用） |
| `notification.list` | Query | Protected | 获取通知列表 |
| `notification.unreadCount` | Query | Protected | 获取未读通知数量 |
| `notification.markRead` | Mutation | Protected | 标记单条通知已读 |
| `notification.markAllRead` | Mutation | Protected | 标记所有通知已读 |
| `notification.checkProactive` | Mutation | Protected | 检查并生成主动通知 |

### 7.8 语音合成接口

| 过程名 | 类型 | 权限 | 输入参数 | 说明 |
|--------|------|------|---------|------|
| `tts.generate` | Mutation | Protected | text（1-5000 字） | 生成语音，返回音频 URL |

---

## 8. 前端页面结构

### 8.1 路由配置

YUMEI 的前端采用 wouter 路由库，配置了以下页面路由：

| 路径 | 页面组件 | 说明 |
|------|---------|------|
| `/` | Home | 首页，展示女友列表和历史对话 |
| `/setup` | Setup | 创建新女友 |
| `/setup/:id` | Setup | 编辑已有女友 |
| `/chat` | Chat | 与当前激活女友聊天 |
| `/chat/:id` | Chat | 继续指定对话 |
| `/gallery` | Gallery | 自拍照片画廊 |
| `/settings` | Settings | 应用设置（API 配置、语音、提示词） |
| `/404` | NotFound | 404 页面 |

### 8.2 页面功能说明

**首页（Home）** 是应用的入口页面，顶部展示欢迎语和用户名，右侧提供批量管理、历史对话、回收站、通知铃铛、主题切换、设置和退出登录等快捷入口。主体区域以卡片列表形式展示所有女友，每张卡片包含头像（优先显示自定义头像，其次显示名称首字母占位圆）、名称、性格简介、心情状态，以及聊天、编辑、删除三个操作按钮。当前激活的女友卡片带有粉色高亮边框和"当前"标签。

**编辑页（Setup）** 分为创建模式和编辑模式。创建模式需要填写名称、性格描述、外貌描述、兴趣爱好，并上传参考图片。编辑模式额外支持头像上传（圆形预览区域，支持更换和移除）、个体定制提示词编辑和分层提示词预览面板。头像上传区域支持 JPG/PNG/GIF/WebP 格式，文件大小限制 10MB，前端进行格式和大小的双重校验。

**聊天页（Chat）** 是核心交互页面。顶栏展示女友头像、名称和心情状态。消息区域支持文本消息和图片消息（自拍）的展示，AI 回复的消息气泡旁显示女友头像。底部输入区域包含文本输入框、发送按钮和拍照按钮。每条 AI 回复旁有语音播放按钮，支持播放速度调节。

**画廊页（Gallery）** 以网格布局展示所有生成的自拍照片，支持查看大图和删除操作。

**设置页（Settings）** 包含多个配置卡片：LLM 配置（OpenRouter API Key 和模型选择）、图像生成配置（fal.ai API Key）、语音配置（三种 TTS 方案切换和声音选择）、AI 行为设定（全局提示词、快捷模板、回复语言和长度限制）。

### 8.3 设计风格

YUMEI 采用**浪漫粉色**为主色调的设计语言，使用 OKLCH 色彩空间定义颜色变量。默认启用深色模式，提供深色/浅色主题切换。UI 组件基于 shadcn/ui 构建，保持一致的圆角、阴影和间距系统。品牌 Logo 为二次元风格的紫发猫耳少女形象，应用于 PWA 图标和 favicon。

### 8.4 移动端适配

应用通过 PWA 技术实现移动端安装体验：配置了 `manifest.json`（standalone 启动模式）、Service Worker（离线缓存）、iOS 和 Android 适配（apple-touch-icon、theme-color 等）。所有页面均实现响应式布局，针对移动端优化了触摸目标大小、安全区域适配（iPhone 刘海屏）和手势操作（左滑返回、下拉刷新）。

---

## 9. 安全与认证

### 9.1 认证流程

YUMEI 使用 Manus OAuth 2.0 进行用户认证。完整流程如下：

1. 用户点击登录按钮，前端通过 `getLoginUrl()` 构造 OAuth 授权 URL，将当前页面的 `origin` 和 `returnPath` 编码在 `state` 参数中。
2. 用户在 Manus OAuth 门户完成登录后，重定向回 `/api/oauth/callback`。
3. 后端解析 `state` 参数提取 `origin`，完成 OAuth 令牌交换，创建或更新用户记录，签发 JWT 会话 Cookie。
4. 后续所有 API 请求通过 Cookie 中的 JWT 令牌进行身份验证，`ctx.user` 自动注入到 tRPC 上下文中。

### 9.2 数据隔离

所有数据库查询均包含 `userId` 条件过滤，确保用户只能访问自己的数据。`protectedProcedure` 中间件在每次请求前验证用户身份，未登录用户无法访问受保护的接口。

### 9.3 API Key 安全

用户配置的第三方 API Key（OpenRouter、fal.ai、ElevenLabs、Fish Audio）存储在数据库中，仅在服务端使用。所有外部 API 调用均在服务端执行，API Key 不会暴露给前端。

---

## 10. 使用说明

### 10.1 首次使用

1. 访问应用 URL，点击"登录"按钮通过 Manus OAuth 完成认证。
2. 登录后系统自动创建默认女友 **YUMEI**（紫发猫耳少女），可直接点击"聊天"开始对话。
3. 默认使用平台内置的 LLM API 进行对话，无需额外配置即可体验基本功能。

### 10.2 创建自定义女友

1. 在首页点击"+"按钮或导航到创建页面。
2. 填写女友名称（必填，最多 100 字）。
3. 编写性格描述（必填），描述女友的性格特征、说话风格和行为习惯。
4. 编写外貌描述（必填），详细描述女友的外貌特征，用于 AI 图像生成。
5. 填写兴趣爱好（可选），丰富角色的人设。
6. 上传一张参考图片（必填），该图片将作为 AI 自拍生成的基础。
7. 点击"创建"完成。

### 10.3 上传女友头像

1. 在首页找到目标女友卡片，点击"编辑"按钮。
2. 在编辑页面找到"头像照片"区域。
3. 点击上传区域或拖拽图片文件到该区域。
4. 支持 JPG、PNG、GIF、WebP 格式，文件大小不超过 10MB。
5. 上传后可预览头像效果，支持更换和移除操作。
6. 点击"保存"使头像生效。

### 10.4 配置高级功能

**配置 OpenRouter（可选，用于选择更多 LLM 模型）：**
1. 进入设置页面，找到"LLM 配置"卡片。
2. 输入 OpenRouter API Key。
3. 系统自动加载可用模型列表，选择偏好的模型。

**配置自拍生成（需要 fal.ai API Key）：**
1. 进入设置页面，找到"图像生成"卡片。
2. 输入 fal.ai API Key。
3. 配置完成后，聊天中可通过拍照按钮或自动触发生成自拍。

**配置语音合成（可选）：**
1. 进入设置页面，找到"语音配置"卡片。
2. 选择语音方案：浏览器内置（免费）、ElevenLabs 或 Fish Audio。
3. 如选择 ElevenLabs 或 Fish Audio，输入对应的 API Key。
4. 从声音列表中选择喜欢的声音/模型。

**配置 AI 行为（可选）：**
1. 进入设置页面，找到"AI 行为设定"卡片。
2. 选择快捷模板或编写自定义全局提示词。
3. 设置回复语言和回复长度限制。
4. 如需为特定女友设置专属指令，在该女友的编辑页面中配置"高级提示词定制"。

### 10.5 日常使用

- **聊天**：在首页点击女友卡片的"聊天"按钮开始新对话，或从历史对话侧边栏继续之前的对话。
- **自拍**：在聊天中点击输入框旁的相机图标手动触发自拍，或在对话中自然提及拍照相关话题时自动触发。
- **语音**：AI 回复旁的播放按钮可播放语音，长按可调节播放速度。
- **通知**：顶栏铃铛图标显示未读通知数量，点击查看女友的主动消息。
- **搜索**：在历史对话侧边栏使用搜索框按关键词查找对话。
- **画廊**：通过导航进入画廊页面查看所有生成的自拍照片。

### 10.6 PWA 安装

**iOS Safari：** 点击分享按钮 → "添加到主屏幕"。

**Android Chrome：** 点击菜单 → "安装应用"或"添加到主屏幕"。

安装后应用以全屏独立窗口运行，体验接近原生应用。

---

## 11. 版本迭代历史

以下是 YUMEI 从初始版本到当前版本的完整迭代记录：

| 版本 | 主要更新 | 测试数 |
|------|---------|--------|
| v1.0 | 基础功能：女友创建/编辑、LLM 对话、fal.ai 自拍生成、画廊、API 配置 | — |
| v1.1 | 语音对话（Web Speech API）、多女友支持、暗黑模式 | — |
| v1.2 | OpenRouter 适配：模型列表查询、搜索分组选择 | 24 |
| v1.3 | 手动触发自拍按钮、生成加载状态 | — |
| v1.4 | 语音双选方案：ElevenLabs + Fish Audio 集成 | 39 |
| v1.5 | 默认女友、删除功能、历史对话侧边栏、语音速度控制 | 43 |
| v1.6 | 对话关键词搜索、女友心情系统 | 50 |
| v1.7 | 首页卡片删除按钮 | — |
| v1.8 | 品牌改名 YUMEI、批量清理、删除保护、回收站机制 | 56 |
| v1.9 | 退出登录、默认深色模式、默认女友创建 Bug 修复 | — |
| v2.0 | 提示词分层方案：全局提示词 + 个体定制 + 快捷模板 + 预览面板 | 71 |
| v2.1 | PWA 移动端适配：Manifest、Service Worker、响应式布局、安全区域 | 71 |
| v2.2 | 品牌 Logo、推送通知系统、手势操作（左滑返回 + 下拉刷新） | 76 |
| v2.3 | 女友头像上传：S3 存储、格式校验、首页/聊天页展示 | 85 |
| v2.3.1 | 头像上传大小限制调整为 10MB | 85 |

---

## 12. 未来规划

基于当前版本的功能基础，以下是建议的后续开发方向：

**短期优化**方面，可以在创建女友流程中同步支持头像上传，省去创建后再编辑的步骤；集成前端图片压缩和裁剪组件，优化头像上传体验；增加对话导出功能，支持将聊天记录导出为文本或 PDF 格式。

**中期功能**方面，可以引入 AI 头像自动生成能力，根据外貌描述自动生成默认头像；实现语音输入（STT），让用户可以通过语音与女友对话；开发女友之间的"社交"功能，如多女友同时在线的群聊模式。

**长期愿景**方面，可以探索实时语音对话（WebRTC + 流式 TTS）、3D 虚拟形象渲染、以及基于长期记忆的深度个性化对话能力。

---

> **文档说明：** 本设计说明书基于 YUMEI v2.3.1 版本的实际代码编写，所有技术细节均来源于项目源代码的直接分析。如有疑问或需要更新，请联系项目维护者。
