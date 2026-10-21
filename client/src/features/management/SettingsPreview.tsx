/** 预览只读取当前草稿，不发送请求、不修改用户数据。 */
import { useState } from "react";
import type { ProductConfig } from "@shared/productConfig";
import { getLevelByPoints, getLevelProgress } from "@shared/intimacy";
import { contentText } from "@shared/discovery";
import { uploadDescription } from "@shared/operationalConfig";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  UploadCloud,
  Bell,
  MessageCircle,
  Headphones,
  Server,
  Link2,
} from "lucide-react";
import type { SettingsSection } from "./settingsModel";
import { isHexColor } from "./ColorField";

const clock = (minute: number) =>
  Number.isFinite(minute)
    ? `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
    : "待填写";
const number = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString("zh-CN") : "待填写";
export function SettingsPreview({
  config,
  section,
  panel,
}: {
  config: ProductConfig;
  section: SettingsSection;
  panel: string;
}) {
  const [points, setPoints] = useState(0);
  let preview: React.ReactNode;
  switch (section) {
    case "billing":
      preview = (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            [
              "已启用套餐",
              `${config.billing.plans.filter(item => item.enabled).length} 个`,
            ],
            [
              "新用户套餐",
              config.billing.plans.find(
                item => item.id === config.billing.defaultTierId
              )?.label["zh-CN"] || "待选择",
            ],
            [
              "计费方式",
              {
                free: "免费额度",
                none: "自托管",
                lemonsqueezy: "Lemon Squeezy 订阅",
              }[config.billing.mode],
            ],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-background/70 p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 text-lg font-semibold">{value}</p>
            </div>
          ))}
        </div>
      );
      break;
    case "selfies":
      preview = (
        <div className="flex flex-wrap gap-3">
          {config.selfies.poses
            .filter(item => item.enabled)
            .map(item => (
              <div
                key={item.id}
                className="min-w-28 rounded-xl border bg-background/70 p-3"
              >
                <span className="text-2xl">{item.emoji}</span>
                <p className="mt-2 text-sm font-medium">
                  {item.label["zh-CN"]}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.minLevel} 级解锁
                  {item.id === config.selfies.defaultPoseId ? " · 默认" : ""}
                </p>
              </div>
            ))}
        </div>
      );
      break;
    case "intimacy": {
      const valid = config.intimacy.levels.filter(item =>
        Number.isFinite(item.requiredPoints)
      );
      const level = valid.length ? getLevelByPoints(points, valid) : undefined;
      preview = (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {config.intimacy.levels.map(item => (
              <span
                key={item.level}
                className="rounded-full border bg-background px-3 py-1.5 text-xs"
              >
                {item.emoji} {item.level} 级 · {item.name["zh-CN"]} ·{" "}
                {number(item.requiredPoints)} 分
              </span>
            ))}
          </div>
          {level && (
            <div className="rounded-xl bg-background/70 p-4">
              <label className="text-sm font-medium">
                升级效果试算 · {points.toLocaleString()} 分 ·{" "}
                {level.name["zh-CN"]}
                <input
                  aria-label="升级效果试算"
                  type="range"
                  min={0}
                  max={Math.max(1, valid.at(-1)!.requiredPoints)}
                  step={1}
                  value={points}
                  onChange={event => setPoints(Number(event.target.value))}
                  className="my-3 block w-full accent-primary"
                />
              </label>
              <Progress value={getLevelProgress(points, valid)} />
              <p className="mt-2 text-xs text-muted-foreground">
                试算不产生经验或用户记录。
              </p>
            </div>
          )}
        </div>
      );
      break;
    }
    case "characters":
      preview = (
        <div className="flex gap-3 rounded-2xl bg-background/70 p-4">
          <MessageCircle className="mt-1 size-6 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="font-medium">
              {contentText(
                config.characters.conversationTitle,
                "zh-CN"
              ).replaceAll("{{name}}", "小桃")}
            </p>
            <p className="mt-2 text-sm">
              {config.characters.defaultBehavior.userNickname || "自然称呼用户"}{" "}
              ·{" "}
              {
                {
                  warm: "温柔",
                  direct: "直率",
                  playful: "俏皮",
                  reserved: "内敛",
                }[config.characters.defaultBehavior.expression]
              }
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              新角色默认相处方式；姓名最多{" "}
              {number(config.characters.limits.name)} 字符，人物设定最多{" "}
              {number(config.characters.limits.personality)} 字符。
            </p>
          </div>
        </div>
      );
      break;
    case "emotion":
      preview = (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {Object.entries(config.emotion.moods).map(([key, item]) => (
              <span
                key={key}
                className="rounded-full border px-3 py-2 text-sm"
                style={{
                  color: isHexColor(item.color) ? item.color : undefined,
                  background: isHexColor(item.background)
                    ? item.background
                    : undefined,
                }}
              >
                {item.emoji} {item.label["zh-CN"]}
              </span>
            ))}
          </div>
          <p className="text-sm">
            基线 {number(config.emotion.baseline)} 分 · 分数范围{" "}
            {number(config.emotion.minScore)}–{number(config.emotion.maxScore)}{" "}
            分 · 开心门槛 {number(config.emotion.thresholds.happy)} 分 ·
            心动门槛 {number(config.emotion.thresholds.excited)} 分
          </p>
        </div>
      );
      break;
    case "memory":
      preview = (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {config.memory.categories.map(item => (
              <Badge key={item.id} variant="outline">
                {item.label["zh-CN"]}
              </Badge>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {config.memory.levelRules.map((item, i) => (
              <div key={i} className="rounded-xl border bg-background/70 p-3">
                <p className="text-sm font-medium">{item.minLevel} 级起</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  可记住 {number(item.capacity)} 条 · 每次召回{" "}
                  {number(item.recallCount)} 条
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            记忆功能{config.memory.enabled ? "开启" : "关闭"}
            ；预览只展示配置，不读取用户记忆。
          </p>
        </div>
      );
      break;
    case "proactive": {
      const p = config.proactive.defaults;
      preview = (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-background/70 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Bell className="size-4" />
              新用户的默认安排
            </p>
            <p className="mt-3 text-xl font-semibold">
              每 {number(p.frequencyDays)} 天
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {p.timeZone} ·{" "}
              {p.quietStart === p.quietEnd
                ? "未设置免打扰"
                : `免打扰 ${clock(p.quietStart)}–${clock(p.quietEnd)}`}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              平台{config.proactive.enabled ? "已允许" : "已关闭"}
              主动联系；用户仍需自行开启。
            </p>
          </div>
          <div className="rounded-xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">
              通知示例 · 示例角色「小桃」
            </p>
            <p className="mt-3 font-medium">
              {contentText(
                config.proactive.templates[
                  p.hidePrivatePreview
                    ? "notifications:privateTitle"
                    : "notifications:title.thinkingOfYou"
                ] ?? {},
                "zh-CN"
              ).replaceAll("{{name}}", "小桃")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {contentText(
                config.proactive.templates[
                  p.hidePrivatePreview
                    ? "notifications:privatePreview"
                    : "notifications:dailyCompanion"
                ] ?? {},
                "zh-CN"
              )
                .replaceAll("{{name}}", "小桃")
                .replaceAll("{{memory}}", "你分享的日常")
                .replaceAll("{{eventDay}}", "明天")}
            </p>
          </div>
        </div>
      );
      break;
    }
    case "uploads": {
      const key = (
        ["avatar", "reference", "couple", "official", "audio"] as const
      ).find(key => key === panel);
      const rule = key ? config.uploads[key] : undefined;
      preview = rule ? (
        <div className="rounded-2xl border-2 border-dashed bg-background/70 p-6 text-center">
          <UploadCloud className="mx-auto size-8 text-primary" />
          <p className="mt-3 font-medium">
            {key === "audio" ? "选择音频文件" : "选择图片"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {uploadDescription(rule).formats || "尚未选择格式"} · 最大{" "}
            {Number.isFinite(rule.maxBytes)
              ? uploadDescription(rule).maxSize
              : "待填写"}
          </p>
          {key === "audio" && (
            <p className="mt-2 text-xs text-muted-foreground">
              最长 {number(config.uploads.audio.maxDurationSeconds)} 秒 ·{" "}
              {number(config.uploads.audio.sampleRate)} Hz
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">用户上传规则预览</p>
        </div>
      ) : (
        <div className="rounded-xl bg-background/70 p-4 text-sm">
          请求容量{" "}
          {Number.isFinite(config.uploads.requestMaxBytes)
            ? number(config.uploads.requestMaxBytes / 1048576)
            : "待填写"}{" "}
          MiB；保存时会同时检查 Base64 膨胀与配置体积。
        </div>
      );
      break;
    }
    case "models":
      preview = (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            [
              "聊天",
              config.models.chat.provider,
              config.models.chat.deepseekModel,
            ],
            [
              "图片",
              config.models.image.provider,
              config.models.image.provider === "comfyui"
                ? config.models.image.comfyuiBaseUrl || "待配置地址"
                : config.models.image.falSelfie,
            ],
            ["转写", "OpenAI", config.models.transcription.model],
          ].map(([label, provider, model]) => (
            <div
              key={label}
              className="min-w-0 rounded-xl border bg-background/70 p-4"
            >
              <Server className="mb-3 size-5 text-primary" />
              <p className="text-sm font-medium">
                {label} → {provider}
              </p>
              <p className="mt-2 break-all text-xs text-muted-foreground">
                {label === "聊天" && config.models.chat.provider !== "deepseek"
                  ? config.billing.defaultChatModel
                  : model}
              </p>
            </div>
          ))}
        </div>
      );
      break;
    case "runtime":
      preview = (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            [
              "聊天回复",
              `${number(config.runtime.chat.replyTimeoutMs / 1000)} 秒超时`,
            ],
            [
              "实例并发",
              `${number(config.runtime.chat.localConcurrency)} 个任务`,
            ],
            [
              "回收站保留",
              `${number(config.runtime.maintenance.companionTrashRetentionMs / 86400000)} 天`,
            ],
          ].map(([label, text]) => (
            <div key={label} className="rounded-xl border bg-background/70 p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 font-semibold">{text}</p>
            </div>
          ))}
        </div>
      );
      break;
    case "experience":
      preview = (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-background/70 p-4">
            <p className="flex items-center gap-2 font-medium">
              <Headphones className="size-4" />
              朗读控制预览
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {config.experience.playback.speeds.map((speed, i) => (
                <span
                  key={i}
                  className={`rounded-full border px-3 py-1 text-xs ${speed === config.experience.playback.defaultSpeed ? "bg-primary text-primary-foreground" : ""}`}
                >
                  {number(speed)}×
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              音量 {number(config.experience.playback.volume * 100)}% ·{" "}
              {config.experience.playback.defaultLanguage}
            </p>
          </div>
          <div className="rounded-xl border bg-background/70 p-4">
            <p className="font-medium">列表体验</p>
            <p className="mt-3 text-sm text-muted-foreground">
              每页 {number(config.experience.pagination.conversations)} 条会话 ·{" "}
              {number(config.experience.pagination.messages)} 条消息
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              最近展示 {number(config.experience.pagination.recentCharacters)}{" "}
              个角色
            </p>
          </div>
        </div>
      );
      break;
    case "prompts":
      preview = (
        <div className="rounded-xl bg-background/70 p-4">
          <p className="font-medium">
            {config.prompts.quickTemplates.filter(item => item.enabled).length}{" "}
            个可用快捷模板
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {config.prompts.quickTemplates
              .filter(item => item.enabled)
              .map(item => (
                <span
                  key={item.id}
                  className="rounded-full border px-3 py-1.5 text-xs"
                >
                  {item.label["zh-CN"]}
                </span>
              ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            总上下文 {number(config.prompts.context.total)} 字符 · 平台{" "}
            {number(config.prompts.context.platform)} 字符 · 补充消息{" "}
            {number(config.prompts.context.followups)}{" "}
            字符。模板仅作展示，不调用模型。
          </p>
        </div>
      );
      break;
    case "site":
      preview = (
        <div className="rounded-xl bg-background/70 p-5 text-center">
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {contentText(config.site.disclosure, "zh-CN") ||
              "填写页脚说明后在此预览"}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {Object.keys(config.site.links).map(key => (
              <span
                key={key}
                className="inline-flex items-center gap-1 text-xs text-primary"
              >
                <Link2 className="size-3" />
                {key === "support" ? "支持与帮助" : key}
              </span>
            ))}
          </div>
        </div>
      );
      break;
  }
  return (
    <section
      aria-label="当前草稿效果预览"
      className="rounded-2xl border bg-muted/25 p-4 sm:p-5"
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">
          当前草稿效果
        </span>
        <Badge variant="secondary" className="text-[10px]">
          保存并发布后生效
        </Badge>
      </div>
      {preview}
    </section>
  );
}
