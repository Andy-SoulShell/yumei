/** 工作流以节点 JSON 导入和具名绑定编辑，格式错误会保留在草稿中并阻止保存。 */
import { useId } from "react";
import type { ProductConfig } from "@shared/productConfig";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { fieldLabel } from "./ConfigForm";
type Workflow = ProductConfig["models"]["image"]["workflows"]["text"];
export function WorkflowEditor({
  value,
  raw,
  onRawChange,
  onChange,
  disabled,
  reference,
}: {
  value: Workflow;
  raw: string;
  onRawChange: (raw: string) => void;
  onChange: (value: Workflow) => void;
  disabled: boolean;
  reference: boolean;
}) {
  const id = useId();
  let error = "";
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      error = "节点内容必须是 JSON 对象";
    else if (Object.keys(parsed).length < 1 || Object.keys(parsed).length > 200)
      error = "工作流需要 1–200 个节点";
  } catch {
    error = "JSON 格式无效，修正后才能保存；当前输入会保留。";
  }
  if (raw.length > 200000) error = "节点 JSON 最多 200000 字符";
  const nodes =
    value.nodes && typeof value.nodes === "object"
      ? Object.entries(value.nodes)
      : [];
  const updateRaw = (next: string) => {
    onRawChange(next);
    try {
      onChange({ ...value, nodes: JSON.parse(next) });
    } catch {
      onChange({ ...value, nodes: {} });
    }
  };
  const bindings = (
    [
      "promptNode",
      "seedNode",
      "outputNode",
      "referenceNode",
      "resizeNode",
    ] as const
  ).filter(key => reference || !["referenceNode", "resizeNode"].includes(key));
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-dashed bg-muted/20 p-4">
        <Label htmlFor={`${id}-import`}>导入 ComfyUI API 节点 JSON</Label>
        <Input
          id={`${id}-import`}
          className="mt-3"
          type="file"
          accept="application/json,.json"
          disabled={disabled}
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void file.text().then(updateRaw);
          }}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          导入节点对象，不是可视化画布文件。先预览并绑定，再保存和发布。
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${id}-name`}>工作流名称</Label>
          <Input
            id={`${id}-name`}
            value={value.id}
            maxLength={200}
            disabled={disabled}
            onChange={event => onChange({ ...value, id: event.target.value })}
          />
        </div>
        {bindings.map(key => (
          <div key={key} className="space-y-2">
            <Label htmlFor={`${id}-${key}`}>{fieldLabel(key)}</Label>
            <Select
              value={value[key] ? `node:${value[key]}` : "none"}
              disabled={disabled}
              onValueChange={next =>
                onChange({
                  ...value,
                  [key]: next === "none" ? null : next.slice(5),
                })
              }
            >
              <SelectTrigger
                id={`${id}-${key}`}
                aria-invalid={
                  !!value[key] && !nodes.some(([node]) => node === value[key])
                }
              >
                <SelectValue placeholder="选择节点" />
              </SelectTrigger>
              <SelectContent>
                {(key === "referenceNode" || key === "resizeNode") &&
                  !reference && <SelectItem value="none">不绑定</SelectItem>}
                {(!value[key] ||
                  !nodes.some(([node]) => node === value[key])) && (
                  <SelectItem
                    value={value[key] ? `node:${value[key]}` : "none"}
                    disabled
                  >
                    {value[key] ? "当前绑定已失效" : "请选择节点"}
                  </SelectItem>
                )}
                {nodes.map(([node, data]) => (
                  <SelectItem key={node} value={`node:${node}`}>
                    {node} ·{" "}
                    {typeof data?.class_type === "string"
                      ? data.class_type
                      : "待完善节点类型"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-nodes`}>节点内容 · {nodes.length} 个节点</Label>
        <Textarea
          id={`${id}-nodes`}
          aria-label="工作流节点 JSON"
          aria-invalid={!!error}
          aria-describedby={`${id}-error`}
          disabled={disabled}
          value={raw}
          spellCheck={false}
          className="min-h-72 font-mono text-xs"
          onChange={event => updateRaw(event.target.value)}
        />
        <p
          id={`${id}-error`}
          aria-live="polite"
          className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {error ||
            `${raw.length} / 200000 字符 · 节点绑定和输入类型会在保存前继续校验`}
        </p>
      </div>
    </div>
  );
}
