/** 当前等级就是编辑上下文：姿势、记忆与相处指令直接写入同一份草稿。 */
import type { ProductConfig } from "@shared/productConfig";
import { useId, useState } from "react";
import { Label } from "@/components/ui/label";
import { memoryLevelRule } from "@shared/memory";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupChoice } from "@/components/ui/radio-group";
import { NumberField } from "./NumberField";
import { ConfigForm, type FormSchema } from "./ConfigForm";
import type { SettingsNavigation } from "./settingsModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Pace = "gradual" | "natural";
export function setLevelMemory(
  config: ProductConfig,
  level: number,
  key: "capacity" | "recallCount",
  value: number
): ProductConfig {
  const current = memoryLevelRule(level, config.memory);
  const next = { ...current, minLevel: level, [key]: value };
  if (key === "capacity" && Number.isInteger(value) && value >= 0)
    next.recallCount = Math.min(next.recallCount, value);
  return {
    ...config,
    memory: {
      ...config.memory,
      levelRules: [
        ...config.memory.levelRules.filter(rule => rule.minLevel !== level),
        next,
      ].sort((a, b) => a.minLevel - b.minLevel),
    },
  };
}
export function LevelBenefitsEditor({
  level,
  config,
  schema,
  issues,
  disabled,
  onChange,
  view,
  onViewChange,
}: {
  level: number;
  config: ProductConfig;
  schema?: FormSchema;
  issues: Record<string, string>;
  disabled: boolean;
  onChange: (next: ProductConfig) => void;
} & SettingsNavigation) {
  const id = useId();
  const [editing, setEditing] = useState<
    "poses" | "memory" | "relationship" | null
  >(null);
  const memory = memoryLevelRule(level, config.memory),
    ownMemory = memory.minLevel === level;
  const pace = (view.selections["level.relationshipPace"] ??
    config.characters.defaultBehavior.relationshipPace) as Pace;
  const stages = config.prompts.chat.relationshipStages[pace],
    stage = [...stages].reverse().find(item => item.minLevel <= level)!,
    ownStage = stage.minLevel === level;
  const stagePath = `prompts.chat.relationshipStages.${pace}.${stages.indexOf(stage)}.instruction`;
  const memoryIndex = config.memory.levelRules.indexOf(memory);
  const currentPoses = config.selfies.poses.filter(
    pose => pose.minLevel === level
  );
  const candidates = config.selfies.poses.filter(
    pose =>
      pose.minLevel !== level &&
      (level === 1 || pose.id !== config.selfies.defaultPoseId)
  );
  const selectedPose = view.selections[`level.poseCandidate.${level}`] ?? "";
  const validPose = candidates.find(pose => pose.id === selectedPose);
  const updateStages = (next: typeof stages) =>
    onChange({
      ...config,
      prompts: {
        ...config.prompts,
        chat: {
          ...config.prompts.chat,
          relationshipStages: {
            ...config.prompts.chat.relationshipStages,
            [pace]: next,
          },
        },
      },
    });
  return (
    <div className="space-y-5" aria-label={`第 ${level} 级的解锁能力`}>
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            {
              id: "poses",
              name: "自拍姿势",
              result: `${currentPoses.filter(pose => pose.enabled).length} 个本级新解锁`,
            },
            {
              id: "memory",
              name: "记忆能力",
              result: `${memory.capacity} 条容量 · 召回 ${memory.recallCount} 条`,
            },
            {
              id: "relationship",
              name: "相处指令",
              result: ownStage ? "本级独立指令" : `沿用第 ${stage.minLevel} 级`,
            },
          ] as const
        ).map(item => (
          <Button
            key={item.id}
            variant="outline"
            className="h-auto flex-col items-start gap-2 p-4 text-left whitespace-normal"
            disabled={disabled}
            onClick={() => setEditing(item.id)}
          >
            <span className="font-semibold">{item.name}</span>
            <span className="text-xs text-muted-foreground">{item.result}</span>
            <span className="text-xs text-primary">
              编辑第 {level} 级{item.name}
            </span>
          </Button>
        ))}
      </div>
      <Dialog
        open={editing !== null}
        onOpenChange={open => {
          if (!open && !disabled) setEditing(null);
        }}
      >
        <DialogContent
          className="sm:max-w-3xl"
          showCloseButton={!disabled}
          onEscapeKeyDown={event => {
            if (disabled) event.preventDefault();
          }}
          onInteractOutside={event => {
            if (disabled) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              第 {level} 级 ·{" "}
              {
                config.intimacy.levels.find(item => item.level === level)?.name[
                  "zh-CN"
                ]
              }
            </DialogTitle>
            <DialogDescription>解锁能力 · 修改合入当前草稿</DialogDescription>
          </DialogHeader>
          <div className="max-h-[65dvh] min-w-0 overflow-y-auto p-1">
            {editing === "poses" && (
              <section className="space-y-4 rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-semibold">自拍姿势</h4>
                  <span className="text-xs text-muted-foreground">
                    本级开放 {currentPoses.filter(pose => pose.enabled).length}{" "}
                    个
                  </span>
                </div>
                <div className="space-y-2">
                  {currentPoses.map(pose => (
                    <div
                      key={pose.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/25 p-3"
                    >
                      <span className="min-w-0 flex-1 text-sm">
                        {pose.emoji} {pose.label["zh-CN"]}
                      </span>
                      <Switch
                        aria-label={`开放姿势：${pose.label["zh-CN"]}`}
                        checked={pose.enabled}
                        disabled={
                          disabled || pose.id === config.selfies.defaultPoseId
                        }
                        onCheckedChange={enabled =>
                          onChange({
                            ...config,
                            selfies: {
                              ...config.selfies,
                              poses: config.selfies.poses.map(item =>
                                item.id === pose.id
                                  ? { ...item, enabled }
                                  : item
                              ),
                            },
                          })
                        }
                      />
                      <select
                        aria-label={`解锁等级：${pose.label["zh-CN"]}`}
                        className="admin-select max-w-full"
                        value={pose.minLevel}
                        disabled={
                          disabled || pose.id === config.selfies.defaultPoseId
                        }
                        onChange={e =>
                          onChange({
                            ...config,
                            selfies: {
                              ...config.selfies,
                              poses: config.selfies.poses.map(item =>
                                item.id === pose.id
                                  ? {
                                      ...item,
                                      minLevel: Number(e.target.value),
                                    }
                                  : item
                              ),
                            },
                          })
                        }
                      >
                        {config.intimacy.levels.map(item => (
                          <option key={item.level} value={item.level}>
                            {item.level} 级 · {item.name["zh-CN"]}
                          </option>
                        ))}
                      </select>
                      {pose.id === config.selfies.defaultPoseId && (
                        <span className="text-xs text-muted-foreground">
                          新手默认
                        </span>
                      )}
                    </div>
                  ))}
                  {currentPoses.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      本级还没有新姿势
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label="移到本级的姿势"
                    className="admin-select min-w-0 flex-1"
                    value={validPose?.id ?? ""}
                    disabled={disabled || candidates.length === 0}
                    onChange={e =>
                      onViewChange({
                        ...view,
                        selections: {
                          ...view.selections,
                          [`level.poseCandidate.${level}`]: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="">选择一个现有姿势</option>
                    {candidates.map(pose => (
                      <option key={pose.id} value={pose.id}>
                        {pose.emoji} {pose.label["zh-CN"]} · 目前{" "}
                        {pose.minLevel} 级{pose.enabled ? "" : " · 未开放"}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled || !validPose}
                    onClick={() => {
                      if (validPose)
                        onChange({
                          ...config,
                          selfies: {
                            ...config.selfies,
                            poses: config.selfies.poses.map(pose =>
                              pose.id === validPose.id
                                ? { ...pose, minLevel: level, enabled: true }
                                : pose
                            ),
                          },
                        });
                    }}
                  >
                    在第 {level} 级开放
                  </Button>
                </div>
              </section>
            )}
            {editing === "memory" && (
              <section className="space-y-4 rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="font-semibold">记忆能力</h4>
                  <span className="text-xs text-muted-foreground">
                    {ownMemory
                      ? `第 ${level} 级起`
                      : `沿用第 ${memory.minLevel} 级`}
                  </span>
                </div>
                <Label htmlFor={`${id}-memory`}>本级单独设置</Label>
                <Switch
                  id={`${id}-memory`}
                  aria-label={`第 ${level} 级单独设置记忆能力`}
                  checked={ownMemory}
                  disabled={disabled || level === 1}
                  onCheckedChange={own =>
                    own
                      ? onChange(
                          setLevelMemory(
                            config,
                            level,
                            "capacity",
                            memory.capacity
                          )
                        )
                      : onChange({
                          ...config,
                          memory: {
                            ...config.memory,
                            levelRules: config.memory.levelRules.filter(
                              rule => rule.minLevel !== level
                            ),
                          },
                        })
                  }
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  {(["capacity", "recallCount"] as const).map(key => (
                    <div key={`${level}.${key}`} className="space-y-2">
                      <Label htmlFor={`${id}-${key}`}>
                        {key === "capacity" ? "本级记忆容量" : "本级日常召回"}
                      </Label>
                      <NumberField
                        id={`${id}-${key}`}
                        label={
                          key === "capacity" ? "本级记忆容量" : "本级日常召回"
                        }
                        value={memory[key]}
                        path={`memory.levelRules.${memoryIndex}.${key}`}
                        schema={{
                          type: "integer",
                          minimum: 0,
                          maximum:
                            key === "recallCount" &&
                            Number.isFinite(memory.capacity)
                              ? memory.capacity
                              : 10000,
                        }}
                        disabled={
                          disabled || !ownMemory || !config.memory.enabled
                        }
                        error={
                          issues[`memory.levelRules.${memoryIndex}.${key}`]
                        }
                        onChange={next =>
                          onChange(setLevelMemory(config, level, key, next))
                        }
                      />
                    </div>
                  ))}
                </div>
                {!config.memory.enabled && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...config,
                        memory: { ...config.memory, enabled: true },
                      })
                    }
                  >
                    开启记忆功能
                  </Button>
                )}
              </section>
            )}
            {editing === "relationship" && (
              <section className="space-y-4 rounded-xl border p-4">
                <h4 className="font-semibold">相处指令</h4>
                <RadioGroup
                  aria-label="编辑哪种关系节奏"
                  value={pace}
                  disabled={disabled}
                  className="grid grid-cols-2 gap-2"
                  onValueChange={next =>
                    onViewChange({
                      ...view,
                      selections: {
                        ...view.selections,
                        "level.relationshipPace": next,
                      },
                    })
                  }
                >
                  <RadioGroupChoice value="gradual" variant="segment">
                    循序渐进
                  </RadioGroupChoice>
                  <RadioGroupChoice value="natural" variant="segment">
                    自然相处
                  </RadioGroupChoice>
                </RadioGroup>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    {ownStage
                      ? `第 ${level} 级起使用本段`
                      : `沿用第 ${stage.minLevel} 级的指令`}
                  </span>
                  <Label htmlFor={`${id}-relationship`}>本级单独设置</Label>
                  <Switch
                    id={`${id}-relationship`}
                    aria-label={`第 ${level} 级单独设置相处指令`}
                    checked={ownStage}
                    disabled={disabled || level === 1}
                    onCheckedChange={own =>
                      updateStages(
                        own
                          ? [...stages, { ...stage, minLevel: level }].sort(
                              (a, b) => a.minLevel - b.minLevel
                            )
                          : stages.filter(item => item.minLevel !== level)
                      )
                    }
                  />
                </div>
                <ConfigForm
                  value={stage.instruction}
                  schema={
                    schema?.properties?.prompts?.properties?.chat?.properties
                      ?.relationshipStages?.properties?.[pace]?.items
                      ?.properties?.instruction
                  }
                  path={stagePath}
                  disabled={disabled || !ownStage}
                  issues={issues}
                  onChange={next =>
                    updateStages(
                      stages.map(item =>
                        item === stage
                          ? { ...item, instruction: String(next) }
                          : item
                      )
                    )
                  }
                />
              </section>
            )}
          </div>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => setEditing(null)}
          >
            完成能力编辑
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
