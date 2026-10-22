/** 视频 API 工作流导入和节点、输入字段绑定；编辑缓冲与草稿分别保留。 */
import { useId } from "react";
import type { VideoWorkflow } from "@shared/video";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** 管理员显式绑定节点和输入字段，兼容 noise_seed 等不同模型的字段命名。 */
export function VideoWorkflowEditor({
  value,
  raw,
  disabled,
  reference,
  onRawChange,
  onChange,
}: {
  value: VideoWorkflow;
  raw: string;
  disabled: boolean;
  reference: boolean;
  onRawChange: (raw: string) => void;
  onChange: (next: VideoWorkflow) => void;
}) {
  const id = useId();
  const updateRaw = (text: string) => {
    onRawChange(text);
    try {
      onChange({ ...value, nodes: JSON.parse(text) });
    } catch {
      onChange({ ...value, nodes: {} });
    }
  };
  let error = "";
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      error = "节点内容必须是 JSON 对象";
  } catch {
    error = "JSON 格式无效，修正后才能保存；当前输入会保留。";
  }
  if (raw.length > 200000) error = "节点 JSON 最多 200000 字符";
  const nodes =
    value.nodes && typeof value.nodes === "object"
      ? Object.entries(value.nodes)
      : [];
  const names = {
    prompt: "提示词",
    seed: "随机种子",
    frames: "总帧数",
    fps: "帧率",
    reference: "首帧图片",
  } as const;
  return (
    <div className="space-y-5">
      <p className="rounded-xl bg-muted/25 p-3 text-sm">
        保存与发布后用于新视频任务；已接收任务继续使用接收时的工作流。输出固定为
        MP4 / H.264，保留工作流原有音频连接。
      </p>
      <Label htmlFor={`${id}-import`}>导入 ComfyUI API 节点 JSON</Label>
      <Input
        id={`${id}-import`}
        type="file"
        accept="application/json,.json"
        disabled={disabled}
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void file.text().then(updateRaw);
        }}
      />
      <Label htmlFor={`${id}-name`}>工作流名称</Label>
      <Input
        id={`${id}-name`}
        value={value.id}
        disabled={disabled}
        onChange={event => onChange({ ...value, id: event.target.value })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {(Object.keys(names) as (keyof typeof names)[])
          .filter(key => key !== "reference" || reference)
          .map(key => {
            const item = value[key];
            return (
              <div key={key} className="space-y-2">
                <Label htmlFor={`${id}-${key}`}>{names[key]}节点</Label>
                <Select
                  value={item?.node || "none"}
                  disabled={disabled}
                  onValueChange={node => {
                    const input =
                      Object.keys(value.nodes[node]?.inputs ?? {})[0] ?? "";
                    onChange({ ...value, [key]: { node, input } });
                  }}
                >
                  <SelectTrigger id={`${id}-${key}`}>
                    <SelectValue placeholder="选择节点" />
                  </SelectTrigger>
                  <SelectContent>
                    {!item && (
                      <SelectItem value="none" disabled>
                        选择节点
                      </SelectItem>
                    )}
                    {nodes.map(([node, data]) => (
                      <SelectItem key={node} value={node}>
                        {node} · {data?.class_type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label htmlFor={`${id}-${key}-input`}>
                  {names[key]}输入字段
                </Label>
                <Input
                  id={`${id}-${key}-input`}
                  disabled={disabled}
                  value={item?.input ?? ""}
                  onChange={event =>
                    onChange({
                      ...value,
                      [key]: {
                        node: item?.node ?? "",
                        input: event.target.value,
                      },
                    })
                  }
                />
              </div>
            );
          })}
        <div className="space-y-2">
          <Label htmlFor={`${id}-output`}>SaveVideo 输出节点</Label>
          <Input
            id={`${id}-output`}
            disabled={disabled}
            value={value.outputNode}
            onChange={event =>
              onChange({ ...value, outputNode: event.target.value })
            }
          />
        </div>
        {(["frameMultiple", "frameRemainder", "minFrames"] as const).map(
          (key, i) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={`${id}-${key}`}>
                {["帧数对齐倍数", "帧数对齐余数", "最少帧数"][i]}
              </Label>
              <Input
                id={`${id}-${key}`}
                type="number"
                disabled={disabled}
                value={value[key]}
                onChange={event =>
                  onChange({ ...value, [key]: Number(event.target.value) })
                }
              />
            </div>
          )
        )}
      </div>
      <Label htmlFor={`${id}-json`}>视频工作流节点 JSON</Label>
      <Textarea
        id={`${id}-json`}
        className="min-h-72 font-mono text-xs"
        spellCheck={false}
        disabled={disabled}
        value={raw}
        aria-invalid={!!error}
        onChange={event => updateRaw(event.target.value)}
      />
      <p
        role="status"
        className={
          error ? "text-sm text-destructive" : "text-sm text-muted-foreground"
        }
      >
        {error || `${nodes.length} 个节点 · 绑定和帧数约束在保存前校验`}
      </p>
    </div>
  );
}
