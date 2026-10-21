/** 使用线上同一套纯函数试算草稿，不读用户数据、不调用模型。 */
import { useId, useState } from "react";
import type { ProductConfig } from "@shared/productConfig";
import { getLevelByPoints, getPointsToNextLevel } from "@shared/intimacy";
import {
  memoryLevelRule,
  memoryInjectionK,
  shouldExtractMemories,
} from "@shared/memory";
import { evolveCompanionEmotion } from "@shared/companionEmotion";
import { proactiveContactWindow } from "@shared/proactiveContact";
import { acceptsUpload, uploadDescription } from "@shared/operationalConfig";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { SettingsSection } from "./settingsModel";
import { formOptionLabel } from "./ConfigForm";

const text = (value: Record<string, string | undefined>) =>
  value["zh-CN"] || "未命名";
const finite = (value: number) => (Number.isFinite(value) ? value : 0);
export function SettingsScenario({
  section,
  panel,
  config,
  initialPoints = 0,
  initialLevel = 1,
}: {
  section: SettingsSection;
  panel: string;
  config: ProductConfig;
  initialPoints?: number;
  initialLevel?: number;
}) {
  const id = useId();
  const [points, setPoints] = useState(initialPoints),
    [rounds, setRounds] = useState(1),
    [message, setMessage] = useState("谢谢你"),
    [level, setLevel] = useState(initialLevel);
  const [consent, setConsent] = useState(false),
    [active, setActive] = useState(false),
    [unread, setUnread] = useState(0);
  const [now, setNow] = useState(() => new Date().toISOString().slice(0, 16)),
    [last, setLast] = useState("");
  const uploadKey = [
    "avatar",
    "reference",
    "couple",
    "official",
    "audio",
  ].includes(panel)
    ? (panel as "avatar" | "reference" | "couple" | "official" | "audio")
    : "avatar";
  const [size, setSize] = useState(
      () => Math.min(1048576, config.uploads[uploadKey].maxBytes) / 1048576
    ),
    [mime, setMime] = useState(
      () => config.uploads[uploadKey].mimeTypes[0] as string
    );
  const numberInput = (
    label: string,
    value: number,
    update: (n: number) => void,
    max?: number
  ) => (
    <label className="block space-y-2 text-xs font-medium">
      {label}
      <Input
        aria-label={label}
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={e => update(Math.max(0, finite(e.target.valueAsNumber)))}
      />
    </label>
  );
  const messageInput = (
    <label className="block space-y-2 text-xs font-medium">
      试一句用户的话
      <Input
        aria-label="试一句用户的话"
        value={message}
        onChange={e => setMessage(e.target.value)}
      />
    </label>
  );
  const levelInput = (
    <label className="block space-y-2 text-xs font-medium">
      体验哪个关系等级
      <select
        aria-label="体验哪个关系等级"
        className="admin-select w-full"
        value={level}
        onChange={e => setLevel(Number(e.target.value))}
      >
        {config.intimacy.levels.map(item => (
          <option key={item.level} value={item.level}>
            {item.level} 级 · {text(item.name)}
          </option>
        ))}
      </select>
    </label>
  );
  let controls: React.ReactNode, result: React.ReactNode;
  if (section === "intimacy" || section === "selfies") {
    const stage = getLevelByPoints(points, config.intimacy.levels),
      rule = memoryLevelRule(stage.level, config.memory);
    const poses = config.selfies.poses.filter(
      pose => pose.enabled && pose.minLevel <= stage.level
    );
    controls = numberInput("模拟累计积分", points, setPoints, 100000000);
    result = (
      <>
        <p className="font-semibold">
          {stage.emoji} {stage.level} 级 · {text(stage.name)}
        </p>
        <p>
          {getPointsToNextLevel(points, config.intimacy.levels) === null
            ? "已达到最高等级"
            : `距下一级还差 ${getPointsToNextLevel(points, config.intimacy.levels)} 分`}
        </p>
        <p>
          可选择：
          {poses.map(pose => `${pose.emoji} ${text(pose.label)}`).join("、") ||
            "暂无可用姿势"}
        </p>
        <p>
          {config.memory.enabled
            ? `记忆容量 ${rule.capacity} 条，普通回复最多召回 ${rule.recallCount} 条。`
            : "记忆功能关闭，容量规则暂不用于自动提取与注入。"}
        </p>
        <p className="text-xs text-muted-foreground">
          积分试算只判断等级与解锁，生成图片仍需额度与服务可用。
        </p>
      </>
    );
  } else if (section === "memory") {
    controls = (
      <>
        {levelInput}
        {numberInput("成功聊天轮次", rounds, setRounds)}
        {messageInput}
      </>
    );
    const rule = memoryLevelRule(level, config.memory),
      extract = shouldExtractMemories(rounds, message, config.memory);
    result = (
      <>
        <p className="font-semibold">
          {extract ? "本轮会安排记忆提取" : "本轮不安排记忆提取"}
        </p>
        <p>
          {config.memory.enabled
            ? `本级共用 ${rule.minLevel} 级起的规则：容量 ${rule.capacity} 条，这句话最多选取 ${memoryInjectionK(level, message, config.memory)} 条记忆。`
            : "记忆功能已关闭，不会向回复注入记忆。"}
        </p>
        <p className="text-xs text-muted-foreground">
          触发不保证产生新记忆；还会去重，并受可用素材与{" "}
          {config.memory.recall.maxChars} 字符召回预算限制。
        </p>
      </>
    );
  } else if (section === "emotion") {
    controls = messageInput;
    const emotion = evolveCompanionEmotion(null, message, config.emotion);
    result = (
      <>
        <p className="font-semibold">
          从基线 {config.emotion.baseline} 分 →{" "}
          {Number.isFinite(emotion.score) ? emotion.score : "待校验"} 分
        </p>
        <p>
          识别为{formOptionLabel(emotion.reason)}，采用
          {formOptionLabel(emotion.tone)}语气。
        </p>
        <p className="text-xs text-muted-foreground">
          这是一次新情绪的规则试算；已有情绪还会带入恢复与受伤延续状态。不会修改亲密度积分。
        </p>
      </>
    );
  } else if (section === "proactive") {
    controls = (
      <>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`${id}-consent`}>模拟用户已主动开启</Label>
          <Switch
            id={`${id}-consent`}
            checked={consent}
            onCheckedChange={setConsent}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`${id}-active`}>模拟正在聊天</Label>
          <Switch
            id={`${id}-active`}
            checked={active}
            onCheckedChange={setActive}
          />
        </div>
        <label className="block space-y-2 text-xs font-medium">
          检查时间（UTC）
          <Input
            aria-label="检查时间（UTC）"
            type="datetime-local"
            value={now}
            onInput={e => setNow(e.currentTarget.value)}
            onChange={e => setNow(e.target.value)}
          />
        </label>
        <label className="block space-y-2 text-xs font-medium">
          上次联系（UTC，可留空）
          <Input
            aria-label="上次联系（UTC，可留空）"
            type="datetime-local"
            value={last}
            onInput={e => setLast(e.currentTarget.value)}
            onChange={e => setLast(e.target.value)}
          />
        </label>
        {numberInput("未读联系数", unread, setUnread, 1000)}
      </>
    );
    const instant = new Date(now + "Z"),
      lastContact = last ? new Date(last + "Z") : null;
    const invalid =
      !Number.isFinite(instant.getTime()) ||
      (lastContact &&
        (!Number.isFinite(lastContact.getTime()) || lastContact > instant));
    const outcome = invalid
      ? null
      : proactiveContactWindow(
          {
            preferences: {
              ...config.proactive.defaults,
              proactiveEnabled: consent,
            },
            now: instant,
            lastContactAt: lastContact,
            unreadContacts: unread,
            hasActiveChat: active,
          },
          config.proactive
        );
    result = (
      <>
        <p className="font-semibold">
          {outcome
            ? {
                disabled: "未获得联系资格：平台未开放、用户未授权或偏好不合法",
                quiet: "暂不联系：用户本地时间处于免打扰",
                active: "暂不联系：用户正在聊天",
                cadence: "暂不联系：频率或未读退避间隔未满足",
                eligible: "已满足时间与授权条件",
              }[outcome.reason]
            : "请填写有效时间，上次联系不能晚于检查时间"}
        </p>
        <p>
          按 {config.proactive.defaults.timeZone}{" "}
          的默认安排试算；已有用户使用自己的偏好。
        </p>
        <p className="text-xs text-muted-foreground">
          通过资格后，还需要可用的事件或日常素材、有效投递渠道；本预览不会发送通知。
        </p>
      </>
    );
  } else if (section === "uploads") {
    const key = ["avatar", "reference", "couple", "official", "audio"].includes(
      panel
    )
      ? (panel as "avatar" | "reference" | "couple" | "official" | "audio")
      : "avatar";
    const rule = config.uploads[key],
      description = uploadDescription(rule),
      bytes = Math.round(size * 1048576);
    controls = (
      <>
        {numberInput("模拟文件大小（MiB）", size, setSize, 256)}
        <label className="block space-y-2 text-xs font-medium">
          模拟文件格式
          <select
            aria-label="模拟文件格式"
            className="admin-select w-full"
            value={mime}
            onChange={e => setMime(e.target.value)}
          >
            {[
              "image/jpeg",
              "image/png",
              "image/gif",
              "image/webp",
              "audio/webm",
              "audio/mp4",
              "audio/mpeg",
            ].map(value => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </>
    );
    result = (
      <>
        <p className="font-semibold">
          {acceptsUpload(rule, { type: mime, size: bytes })
            ? "此用途的文件校验通过"
            : "文件不符合此用途的格式或容量要求"}
        </p>
        <p>
          允许 {description.formats}，最大 {description.maxSize}。
        </p>
        <p>
          编码后约 {Math.ceil(bytes / 3) * 4} B，另需请求封装空间；当前请求上限{" "}
          {config.uploads.requestMaxBytes} B。
        </p>
        {key === "audio" && (
          <p className="text-xs text-muted-foreground">
            录音还需满足 {config.experience.minimumRecordingSeconds}–
            {config.uploads.audio.maxDurationSeconds} 秒的时长要求。
          </p>
        )}
      </>
    );
  } else return null;
  return (
    <section
      aria-label="规则试算"
      className="rounded-2xl border bg-muted/20 p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">代入一个用户，看看会发生什么</h3>
        <span className="text-xs text-muted-foreground">
          当前草稿 · 只试算，不保存用户数据
        </span>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(180px,1fr)_2fr]">
        <div className="space-y-3">{controls}</div>
        <output
          className="block space-y-2 rounded-xl bg-background p-4 text-sm leading-6"
          aria-live="polite"
        >
          {result}
        </output>
      </div>
    </section>
  );
}
