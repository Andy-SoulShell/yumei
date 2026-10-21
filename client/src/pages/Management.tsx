/** 单密码运营后台：直接调用既有管理 API 编辑草稿、校验并发布。 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Code2,
  FileText,
  ImagePlus,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
  Sun,
  Moon,
} from "lucide-react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { trpc } from "@/lib/trpc";
import { useProductConfig } from "@/features/product/useProductConfig";
import { productConfigSchema, type ProductConfig } from "@shared/productConfig";
import {
  homepageSchema,
  officialCharacterSchema,
  officialImageSchema,
} from "@shared/discovery";
import { ConfigForm, type FormSchema } from "@/features/management/ConfigForm";
import { ThemeEditor } from "@/features/management/ThemeEditor";
import { useOfficialUpload } from "@/features/management/useOfficialUpload";
import "@/features/management/management.css";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
type Outputs = inferRouterOutputs<AppRouter>;
type ProductDraft = Outputs["productConfig"]["admin"]["getDraft"];
type DiscoveryDraft = Outputs["discovery"]["admin"]["getDraft"];
type Pane = "overview" | "official" | "home" | keyof ProductConfig;
const sections: {
  id: keyof ProductConfig;
  name: string;
  description: string;
}[] = [
  {
    id: "billing",
    name: "套餐与额度",
    description: "价格、支付映射、权益与计费模式。额度为 null 时表示不限量。",
  },
  {
    id: "selfies",
    name: "自拍姿势",
    description: "姿势名称、别名、解锁等级与画面提示。",
  },
  {
    id: "intimacy",
    name: "亲密度规则",
    description: "等级、奖励、冷却与每日上限。",
  },
  {
    id: "prompts",
    name: "提示词模板",
    description:
      "快捷模板、系统提示词、图片、语音与记忆模板。保留模板要求的具名变量。",
  },
  {
    id: "memory",
    name: "记忆规则",
    description: "容量、提取、检索、摘要与后台任务。",
  },
  {
    id: "themes",
    name: "主题配色",
    description: "多语言名称、色卡和实际明暗配色。默认主题必须存在并启用。",
  },
  {
    id: "proactive",
    name: "主动联系与通知",
    description: "频率、事件窗口、免打扰默认值、重试及多语言通知。",
  },
  {
    id: "uploads",
    name: "上传与录音",
    description:
      "文件容量使用字节，时长使用秒。请求体必须容纳最大文件的 Base64 数据。",
  },
  {
    id: "models",
    name: "模型与工作流",
    description:
      "服务、运营方网关、模型和 ComfyUI 完整工作流。凭据由服务端环境保管。",
  },
  {
    id: "runtime",
    name: "执行与回收",
    description:
      "预算、超时、并发、租约、目录查询和后台回收。时间字段以毫秒计。",
  },
  {
    id: "characters",
    name: "角色默认与上限",
    description: "默认行为、资料字数与提示词资料预算。",
  },
  {
    id: "emotion",
    name: "情绪规则",
    description: "分数、恢复、惯性、心情名称与颜色。",
  },
  {
    id: "experience",
    name: "分页、播放与连接",
    description: "列表容量、朗读、录音下限、重连和运营统计窗口。",
  },
  {
    id: "site",
    name: "运营链接与页脚",
    description: "公开说明、服务设置链接与支持资源。",
  },
];
const productForm = z.toJSONSchema(productConfigSchema, {
  unrepresentable: "any",
}) as FormSchema;
const homeForm = z.toJSONSchema(homepageSchema, {
  unrepresentable: "any",
}) as FormSchema;
const characterForm = z.toJSONSchema(officialCharacterSchema, {
  unrepresentable: "any",
}) as FormSchema;
function message(error: unknown) {
  const value = error as { message?: string; data?: { code?: string } };
  return value.data?.code === "CONFLICT"
    ? "草稿已被其他会话修改。当前编辑已保留，请复制需要保留的内容，再重新读取草稿。"
    : (value.message ?? "操作失败，请重试");
}
function validation(error: z.ZodError) {
  return error.issues
    .slice(0, 12)
    .map(item => `${item.path.join(".") || "配置"}：${item.message}`)
    .join("\n");
}
function LoadError({ retry }: { retry: () => void }) {
  return (
    <Card>
      <CardContent className="p-8 text-center">
        <p className="mb-4 text-sm text-muted-foreground">
          管理数据暂时无法读取。
        </p>
        <Button variant="outline" onClick={retry}>
          <RefreshCw className="mr-2 size-4" />
          重新读取
        </Button>
      </CardContent>
    </Card>
  );
}
function WorkspaceHeader({
  title,
  description,
  revision,
  publishedRevision,
  busy,
  dirty,
  onSave,
  onPublish,
  onReload,
}: {
  title: string;
  description: string;
  revision: number;
  publishedRevision: number;
  busy: boolean;
  dirty: boolean;
  onSave: () => void;
  onPublish: () => void;
  onReload: () => void;
}) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        <Badge
          variant={
            dirty || revision !== publishedRevision ? "outline" : "secondary"
          }
        >
          {dirty
            ? "有未保存修改"
            : revision !== publishedRevision
              ? "草稿待发布"
              : "已发布"}
        </Badge>
      </div>
      <div className="sticky top-[72px] z-10 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 p-3 shadow-sm backdrop-blur">
        <span className="text-xs text-muted-foreground">
          草稿 {revision} · 已发布 {publishedRevision}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" disabled={busy} onClick={onReload}>
            <RefreshCw className="mr-1.5 size-3.5" />
            重新读取
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !dirty}
            onClick={onSave}
          >
            {busy ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 size-3.5" />
            )}
            保存草稿
          </Button>
          <Button
            size="sm"
            disabled={busy || dirty || revision === publishedRevision}
            onClick={onPublish}
            title={dirty ? "请先保存草稿" : undefined}
          >
            <Send className="mr-1.5 size-3.5" />
            发布
          </Button>
        </div>
      </div>
    </>
  );
}
function EditorMode({
  mode,
  setMode,
  disabled = false,
}: {
  mode: "form" | "json";
  setMode: (mode: "form" | "json") => void;
  disabled?: boolean;
}) {
  return (
    <div className="mb-5 flex gap-1 rounded-lg bg-muted/50 p-1 w-fit">
      <Button
        size="sm"
        disabled={disabled}
        variant={mode === "form" ? "secondary" : "ghost"}
        onClick={() => setMode("form")}
      >
        <FileText className="mr-1.5 size-3.5" />
        表单
      </Button>
      <Button
        size="sm"
        disabled={disabled}
        variant={mode === "json" ? "secondary" : "ghost"}
        onClick={() => setMode("json")}
      >
        <Code2 className="mr-1.5 size-3.5" />
        JSON
      </Button>
    </div>
  );
}
function ErrorText({ error }: { error: string }) {
  return error ? (
    <p
      role="alert"
      className="mb-4 whitespace-pre-wrap break-words rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
    >
      {error}
    </p>
  ) : null;
}
/** 每次保存完整业务快照；版本冲突时保留当前编辑内容。 */
function ProductWorkspace({
  draft,
  section,
  onReload,
  onDirty,
}: {
  draft: ProductDraft;
  section: keyof ProductConfig;
  onReload: () => Promise<unknown>;
  onDirty: (dirty: boolean) => void;
}) {
  const [value, setValue] = useState(() => structuredClone(draft.config));
  const [mode, setMode] = useState<"form" | "json">("form");
  const [raw, setRaw] = useState(() => JSON.stringify(value[section], null, 2));
  const [error, setError] = useState("");
  const save = trpc.productConfig.admin.save.useMutation(),
    publish = trpc.productConfig.admin.publish.useMutation();
  const utils = trpc.useUtils();
  const dirty =
    JSON.stringify(value) !== JSON.stringify(draft.config) ||
    (mode === "json" && raw !== JSON.stringify(value[section], null, 2));
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const busy = save.isPending || publish.isPending,
    info = sections.find(item => item.id === section)!;
  const submit = async () => {
    try {
      const candidate =
        mode === "json" ? { ...value, [section]: JSON.parse(raw) } : value;
      const parsed = productConfigSchema.safeParse(candidate);
      if (!parsed.success) {
        setError(validation(parsed.error));
        return;
      }
      await save.mutateAsync({
        expectedRevision: draft.revision,
        config: parsed.data,
      });
      toast.success("草稿已保存，发布后生效");
      await onReload();
    } catch (error) {
      setError(message(error));
    }
  };
  const publishDraft = async () => {
    try {
      await publish.mutateAsync({ expectedRevision: draft.revision });
      await utils.productConfig.get.invalidate();
      toast.success("业务配置已发布");
      await onReload();
    } catch (error) {
      setError(message(error));
    }
  };
  const switchMode = (next: "form" | "json") => {
    if (next === mode) return;
    if (next === "json") {
      setRaw(JSON.stringify(value[section], null, 2));
      setMode(next);
    } else {
      try {
        const candidate = productConfigSchema.safeParse({
          ...value,
          [section]: JSON.parse(raw),
        });
        if (!candidate.success) {
          setError(validation(candidate.error));
          return;
        }
        setValue(candidate.data);
        setMode(next);
        setError("");
      } catch {
        setError("JSON 格式无效，请修正后再切换表单。");
      }
    }
  };
  return (
    <>
      <WorkspaceHeader
        title={info.name}
        description={info.description}
        revision={draft.revision}
        publishedRevision={draft.publishedRevision}
        busy={busy}
        dirty={dirty}
        onSave={() => void submit()}
        onPublish={() => void publishDraft()}
        onReload={() => {
          if (!dirty || window.confirm("放弃当前未保存的修改并重新读取？"))
            void onReload().catch(error => setError(message(error)));
        }}
      />
      <ErrorText error={error} />
      <Card>
        <CardContent className="p-4 sm:p-6">
          <EditorMode mode={mode} setMode={switchMode} disabled={busy} />
          {mode === "form" ? (
            section === "themes" ? (
              <ThemeEditor
                value={value.themes}
                schema={productForm.properties?.themes}
                disabled={busy}
                onChange={themes => {
                  setValue({ ...value, themes });
                  setError("");
                }}
              />
            ) : (
              <ConfigForm
                value={value[section]}
                schema={productForm.properties?.[section]}
                path={section}
                disabled={busy}
                onChange={next => {
                  setValue({ ...value, [section]: next });
                  setError("");
                }}
              />
            )
          ) : (
            <Textarea
              aria-label={`${info.name} JSON`}
              value={raw}
              onChange={event => setRaw(event.target.value)}
              disabled={busy}
              spellCheck={false}
              className="min-h-[60vh] resize-y font-mono text-xs leading-6"
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
function HomeWorkspace({
  draft,
  onReload,
  onDirty,
}: {
  draft: DiscoveryDraft;
  onReload: () => Promise<unknown>;
  onDirty: (dirty: boolean) => void;
}) {
  const [value, setValue] = useState(() => structuredClone(draft.home));
  const [mode, setMode] = useState<"form" | "json">("form"),
    [raw, setRaw] = useState(() => JSON.stringify(value, null, 2)),
    [error, setError] = useState("");
  const save = trpc.discovery.admin.saveHomepage.useMutation(),
    publish = trpc.discovery.admin.publish.useMutation(),
    utils = trpc.useUtils();
  const imageUpload = useOfficialUpload(setError);
  const busy = save.isPending || publish.isPending || imageUpload.pending;
  const dirty =
    JSON.stringify(value) !== JSON.stringify(draft.home) ||
    (mode === "json" && raw !== JSON.stringify(value, null, 2));
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const submit = async () => {
    try {
      const parsed = homepageSchema.safeParse(
        mode === "json" ? JSON.parse(raw) : value
      );
      if (!parsed.success) {
        setError(validation(parsed.error));
        return;
      }
      await save.mutateAsync({
        expectedRevision: draft.revision,
        home: parsed.data,
      });
      toast.success("首页草稿已保存");
      await onReload();
    } catch (error) {
      setError(message(error));
    }
  };
  const publishDraft = async () => {
    try {
      await publish.mutateAsync({ expectedRevision: draft.revision });
      await utils.discovery.get.invalidate();
      toast.success("官方内容已统一发布");
      await onReload();
    } catch (error) {
      setError(message(error));
    }
  };
  return (
    <>
      <WorkspaceHeader
        title="首页内容"
        description="默认角色、精选角色 ID、轮播和 FAQ。首页与官方角色一起发布，引用必须有效。"
        revision={draft.revision}
        publishedRevision={draft.publishedRevision}
        busy={busy}
        dirty={dirty}
        onSave={() => void submit()}
        onPublish={() => void publishDraft()}
        onReload={() => {
          if (!dirty || window.confirm("放弃未保存修改？"))
            void onReload().catch(error => setError(message(error)));
        }}
      />
      <ErrorText error={error} />
      <Card>
        <CardContent className="p-4 sm:p-6">
          <EditorMode
            mode={mode}
            disabled={busy}
            setMode={next => {
              if (next === mode) return;
              if (next === "json") {
                setRaw(JSON.stringify(value, null, 2));
                setMode(next);
              } else {
                try {
                  const candidate = homepageSchema.safeParse(JSON.parse(raw));
                  if (!candidate.success) {
                    setError(validation(candidate.error));
                    return;
                  }
                  setValue(candidate.data);
                  setMode(next);
                } catch {
                  setError("JSON 格式无效");
                }
              }
            }}
          />
          {mode === "form" ? (
            <ConfigForm
              value={value}
              schema={homeForm}
              path="home"
              disabled={busy}
              onUpload={imageUpload.uploadFile}
              uploadAccept={imageUpload.accept}
              choices={path =>
                path === "home.defaultPresetId" ||
                /^home\.featuredIds\.\d+$/.test(path)
                  ? draft.characters
                      .filter(
                        item =>
                          !item.archived &&
                          (path === "home.defaultPresetId" || item.data.listed)
                      )
                      .map(item => ({
                        value: item.id,
                        label: `${item.data.name} · ${item.id}`,
                        imageUrl: item.data.imageUrl,
                      }))
                  : undefined
              }
              onChange={next => setValue(next as typeof value)}
            />
          ) : (
            <Textarea
              aria-label="首页内容 JSON"
              value={raw}
              disabled={busy}
              onChange={event => setRaw(event.target.value)}
              spellCheck={false}
              className="min-h-[60vh] font-mono text-xs leading-6"
            />
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            可选角色：
            {draft.characters
              .filter(item => !item.archived)
              .map(item => `${item.data.name} (${item.id})`)
              .join(" · ")}
          </p>
        </CardContent>
      </Card>
    </>
  );
}
function CharacterWorkspace({
  draft,
  selected,
  onSelect,
  onReload,
  onDirty,
}: {
  draft: DiscoveryDraft;
  selected: string;
  onSelect: (id: string) => void;
  onReload: () => Promise<unknown>;
  onDirty: (dirty: boolean) => void;
}) {
  const policy = useProductConfig(),
    source = draft.characters.find(item => item.id === selected);
  const [value, setValue] = useState(() => {
      if (source) return structuredClone(source.data);
      return {
        ...structuredClone(draft.characters[0].data),
        id: `character-${crypto.randomUUID().slice(0, 8)}`,
        name: "新角色",
        listed: true,
        behavior: structuredClone(policy.raw!.characters.defaultBehavior),
      };
    }),
    [error, setError] = useState(""),
    [search, setSearch] = useState("");
  const save = trpc.discovery.admin.saveCharacter.useMutation(),
    archive = trpc.discovery.admin.archiveCharacter.useMutation(),
    publish = trpc.discovery.admin.publish.useMutation(),
    utils = trpc.useUtils();
  const imageUpload = useOfficialUpload(setError);
  const dirty =
    !source || JSON.stringify(value) !== JSON.stringify(source.data);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const busy =
    imageUpload.pending ||
    save.isPending ||
    archive.isPending ||
    publish.isPending;
  const select = (id: string) => {
    if (!dirty || window.confirm("放弃当前未保存修改？")) onSelect(id);
  };
  const newCharacter = () => {
    if (dirty && !window.confirm("放弃当前未保存修改？")) return;
    onSelect("new");
  };
  const submit = async () => {
    try {
      const parsed = officialCharacterSchema.safeParse(value);
      if (!parsed.success) {
        setError(validation(parsed.error));
        return;
      }
      if (
        !source &&
        draft.characters.some(item => item.id === parsed.data.id)
      ) {
        setError("该 ID 已存在，请使用新的 ID，或选择已有角色编辑。");
        return;
      }
      await save.mutateAsync({
        expectedRevision: draft.revision,
        character: parsed.data,
      });
      toast.success("角色草稿已保存");
      await onReload();
      onSelect(parsed.data.id);
    } catch (error) {
      setError(message(error));
    }
  };
  const publishDraft = async () => {
    try {
      await publish.mutateAsync({ expectedRevision: draft.revision });
      await utils.discovery.get.invalidate();
      toast.success("官方内容已统一发布");
      await onReload();
    } catch (error) {
      setError(message(error));
    }
  };
  const uploadFile = async (file: File) => {
    try {
      const imageUrl = await imageUpload.uploadFile(file);
      setValue(current => ({ ...current, imageUrl }));
    } catch {
      /* 共用上传入口已展示错误。 */
    }
  };
  const schema = {
    ...characterForm,
    properties: {
      ...characterForm.properties,
      id: { ...characterForm.properties?.id, readOnly: !!source },
    },
  } as FormSchema;
  return (
    <>
      <WorkspaceHeader
        title="官方角色"
        description="编辑官方预设、上传图片或归档角色。用户角色继续通过稳定 ID 关联预设，发布时统一校验首页引用。"
        revision={draft.revision}
        publishedRevision={draft.publishedRevision}
        busy={busy}
        dirty={dirty}
        onSave={() => void submit()}
        onPublish={() => void publishDraft()}
        onReload={() => {
          if (!dirty || window.confirm("放弃未保存修改？"))
            void onReload().catch(error => setError(message(error)));
        }}
      />
      <ErrorText error={error} />
      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <Card className="self-start">
          <CardContent className="space-y-3 p-3">
            <Button
              className="w-full"
              variant="outline"
              disabled={busy || !policy.raw || selected === "new"}
              onClick={newCharacter}
            >
              <Plus className="mr-1.5 size-4" />
              新增角色
            </Button>
            <select
              aria-label="选择官方角色"
              value={selected}
              disabled={busy}
              onChange={event => select(event.target.value)}
              className="h-10 w-full rounded-xl border bg-background px-3 text-sm xl:hidden"
            >
              {selected === "new" && <option value="new">新角色草稿</option>}
              {draft.characters.map(item => (
                <option key={item.id} value={item.id}>
                  {item.data.name}
                  {item.archived ? "（已归档）" : ""}
                </option>
              ))}
            </select>
            <Input
              aria-label="搜索官方角色"
              className="hidden xl:block"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="搜索名称或 ID"
            />
            <div className="hidden max-h-[65vh] space-y-1 overflow-y-auto xl:block">
              {draft.characters
                .filter(item =>
                  `${item.id} ${item.data.name}`
                    .toLowerCase()
                    .includes(search.toLowerCase())
                )
                .map(item => (
                  <Button
                    key={item.id}
                    variant={selected === item.id ? "secondary" : "ghost"}
                    className="h-auto w-full justify-start gap-2 px-2 py-2 text-left"
                    disabled={busy}
                    onClick={() => select(item.id)}
                  >
                    <img
                      src={item.data.imageUrl}
                      alt=""
                      className="size-9 rounded-lg object-cover"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">
                        {item.data.name}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {item.archived ? "已归档 · " : ""}
                        {item.id}
                      </span>
                    </span>
                  </Button>
                ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              {officialImageSchema.safeParse(value.imageUrl).success && (
                <img
                  src={value.imageUrl}
                  alt={value.name}
                  className="size-20 rounded-2xl object-cover"
                />
              )}
              <Label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <ImagePlus className="size-4" />
                {imageUpload.pending ? "正在上传…" : "上传官方图片"}
                <Input
                  aria-label="上传官方图片"
                  type="file"
                  className="sr-only"
                  accept={policy.raw?.uploads.official.mimeTypes.join(",")}
                  disabled={busy || !policy.raw}
                  onChange={event => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void uploadFile(file);
                  }}
                />
              </Label>
              {source && !source.archived && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={
                    busy || dirty || source.id === draft.home.defaultPresetId
                  }
                  onClick={() => {
                    void archive
                      .mutateAsync({
                        expectedRevision: draft.revision,
                        id: source.id,
                      })
                      .then(() => onReload())
                      .catch(error => setError(message(error)));
                  }}
                >
                  <Trash2 className="mr-1.5 size-3.5" />
                  归档
                </Button>
              )}
              {source?.archived && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void submit()}
                >
                  恢复到草稿
                </Button>
              )}
            </div>
            <ConfigForm
              value={value}
              path="character"
              schema={schema}
              disabled={busy}
              onChange={next => setValue(next as typeof value)}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
/** 路由保持与用户登录独立，所有状态和写入都由服务端会话判定。 */
export default function Management() {
  const session = trpc.management.status.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
  });
  const [password, setPassword] = useState(""),
    [error, setError] = useState("");
  const login = trpc.management.login.useMutation(),
    logout = trpc.management.logout.useMutation(),
    cache = useQueryClient();
  const authenticate = async () => {
    setError("");
    try {
      await login.mutateAsync({ password });
      setPassword("");
      cache.removeQueries({ queryKey: getQueryKey(trpc.productConfig.admin) });
      cache.removeQueries({ queryKey: getQueryKey(trpc.discovery.admin) });
      await session.refetch();
    } catch (error) {
      setError(message(error));
    }
  };
  const signOut = async () => {
    try {
      await logout.mutateAsync();
      cache.removeQueries({ queryKey: getQueryKey(trpc.productConfig.admin) });
      cache.removeQueries({ queryKey: getQueryKey(trpc.discovery.admin) });
      await session.refetch();
    } catch (error) {
      toast.error(message(error));
    }
  };
  if (session.isLoading)
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  if (session.isError)
    return (
      <div className="mx-auto max-w-lg p-6">
        <LoadError retry={() => void session.refetch()} />
      </div>
    );
  if (!session.data?.authenticated)
    return (
      <div className="admin-login mx-auto flex min-h-[85vh] max-w-md flex-col justify-center gap-6 px-5 py-10">
        <Link
          href="/"
          className="flex w-fit items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
          返回站点
        </Link>
        <div>
          <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[.22em] text-primary">
            YUMEI · MANAGEMENT
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            管理后台
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            使用管理密码编辑和发布站点内容。
          </p>
        </div>
        <Card>
          <CardContent className="p-6">
            <form
              className="space-y-4"
              onSubmit={event => {
                event.preventDefault();
                void authenticate();
              }}
            >
              <Label htmlFor="management-password">管理密码</Label>
              <Input
                id="management-password"
                type="password"
                name="management-password"
                autoComplete="current-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                disabled={login.isPending || !session.data?.configured}
              />
              <ErrorText error={error} />
              {!session.data?.configured && (
                <p role="status" className="text-sm text-muted-foreground">
                  尚未配置管理密码。请在服务端设置至少 8 位的 ADMIN_PASSWORD
                  后启动。
                </p>
              )}
              <Button
                className="w-full"
                disabled={
                  login.isPending || !password || !session.data?.configured
                }
              >
                {login.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <LockKeyhole className="mr-2 size-4" />
                )}
                进入管理后台
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  return (
    <ManagementConsole
      onLogout={() => void signOut()}
      onExpired={() => void session.refetch()}
    />
  );
}
function ManagementConsole({
  onLogout,
  onExpired,
}: {
  onLogout: () => void;
  onExpired: () => void;
}) {
  const appearance = usePreferences();
  const [pane, setPane] = useState<Pane>("overview"),
    [dirty, setDirty] = useState(false),
    [epoch, setEpoch] = useState(0),
    [characterId, setCharacterId] = useState("");
  const product = trpc.productConfig.admin.getDraft.useQuery(undefined, {
      retry: false,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }),
    discovery = trpc.discovery.admin.getDraft.useQuery(undefined, {
      retry: false,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });
  useEffect(() => {
    if (
      product.error?.data?.code === "FORBIDDEN" ||
      discovery.error?.data?.code === "FORBIDDEN"
    )
      onExpired();
  }, [product.error, discovery.error, onExpired]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const navigate = (next: Pane) => {
    if (next === pane) return;
    if (dirty && !window.confirm("当前有未保存的修改，放弃并切换？")) return;
    setDirty(false);
    setPane(next);
  };
  const reloadProduct = async () => {
    const result = await product.refetch();
    if (result.error) throw result.error;
    setEpoch(value => value + 1);
  };
  const reloadDiscovery = async () => {
    const result = await discovery.refetch();
    if (result.error) throw result.error;
    setEpoch(value => value + 1);
  };
  const menu = useMemo(
    () => [
      { id: "overview" as Pane, name: "总览", icon: LayoutDashboard },
      { id: "official" as Pane, name: "官方角色", icon: Users },
      { id: "home" as Pane, name: "首页、轮播与 FAQ", icon: FileText },
      ...sections.map(item => ({ ...item, icon: Settings2 })),
    ],
    []
  );
  const nav = (
    <>
      {menu.map(item => (
        <Button
          key={item.id}
          variant={pane === item.id ? "secondary" : "ghost"}
          className="w-full justify-start gap-2 rounded-xl text-sm"
          onClick={() => navigate(item.id)}
        >
          <item.icon className="size-4 shrink-0" />
          {item.name}
          {pane === item.id && <ChevronRight className="ml-auto size-3.5" />}
        </Button>
      ))}
    </>
  );
  const ready = product.data && discovery.data;
  return (
    <div className="admin-shell min-h-screen bg-background">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <span className="font-semibold tracking-tight">
            YUMEI{" "}
            <span className="ml-1 hidden text-sm font-normal text-muted-foreground sm:inline">
              管理后台
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={
              appearance.resolvedMode === "dark"
                ? "切换浅色模式"
                : "切换深色模式"
            }
            onClick={() =>
              appearance.update({
                colorMode:
                  appearance.resolvedMode === "dark" ? "light" : "dark",
              })
            }
          >
            {appearance.resolvedMode === "dark" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link
              href="/"
              aria-label="返回站点"
              onClick={event => {
                if (dirty && !window.confirm("放弃未保存修改并返回站点？"))
                  event.preventDefault();
              }}
            >
              <ArrowLeft className="size-4 sm:hidden" />
              <span className="hidden sm:inline">返回站点</span>
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="退出"
            onClick={() => {
              if (!dirty || window.confirm("放弃未保存修改并退出？"))
                onLogout();
            }}
          >
            <LogOut className="size-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">退出</span>
          </Button>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1600px] md:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="hidden h-[calc(100vh-4rem)] overflow-y-auto border-r p-3 md:sticky md:top-16 md:block">
          <p className="px-3 pb-3 pt-2 text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">
            内容与配置
          </p>
          <nav className="space-y-1" aria-label="管理导航">
            {nav}
          </nav>
        </aside>
        <main className="min-w-0 p-4 sm:p-6 lg:p-8">
          <div className="mb-5 md:hidden">
            <Label htmlFor="management-section" className="sr-only">
              管理分区
            </Label>
            <select
              id="management-section"
              className="h-11 w-full rounded-xl border bg-card px-3 text-sm"
              value={pane}
              onChange={event => navigate(event.target.value as Pane)}
            >
              {menu.map(item => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          {!ready ? (
            product.isError || discovery.isError ? (
              <LoadError
                retry={() => {
                  void product.refetch();
                  void discovery.refetch();
                }}
              />
            ) : (
              <div role="status" className="flex justify-center py-20">
                <Loader2 className="size-6 animate-spin" />
              </div>
            )
          ) : pane === "overview" ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">
                管理总览
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                编辑内容，保存草稿，确认后统一发布。
              </p>
              <div className="my-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    name: "官方角色",
                    count: discovery.data.characters.filter(
                      item => !item.archived
                    ).length,
                  },
                  {
                    name: "启用套餐",
                    count: product.data.config.billing.plans.filter(
                      item => item.enabled
                    ).length,
                  },
                  {
                    name: "启用主题",
                    count: product.data.config.themes.items.filter(
                      item => item.enabled
                    ).length,
                  },
                  {
                    name: "待发布配置",
                    count:
                      Number(
                        product.data.revision !== product.data.publishedRevision
                      ) +
                      Number(
                        discovery.data.revision !==
                          discovery.data.publishedRevision
                      ),
                  },
                ].map(item => (
                  <Card key={item.name}>
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground">
                        {item.name}
                      </p>
                      <p className="mt-2 text-3xl font-semibold tabular-nums">
                        {item.count}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">官方内容</CardTitle>
                    <CardDescription>
                      角色库、首页精选、轮播与 FAQ 一起发布。
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-4 text-xs text-muted-foreground">
                      草稿 {discovery.data.revision} · 已发布{" "}
                      {discovery.data.publishedRevision}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => navigate("official")}
                    >
                      管理官方角色
                      <ChevronRight className="ml-2 size-4" />
                    </Button>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">业务与运行配置</CardTitle>
                    <CardDescription>
                      全部业务分区保存为同一份快照，发布时统一校验。
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-4 text-xs text-muted-foreground">
                      草稿 {product.data.revision} · 已发布{" "}
                      {product.data.publishedRevision}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => navigate("billing")}
                    >
                      编辑业务配置
                      <ChevronRight className="ml-2 size-4" />
                    </Button>
                  </CardContent>
                </Card>
              </div>
              <div className="mt-6 flex items-start gap-3 rounded-2xl border bg-primary/5 p-5 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-muted-foreground">
                  草稿不会影响前台。发布后，界面与服务执行读取同一份配置；前台页面会在重新聚焦或定时刷新时同步。
                </p>
              </div>
            </>
          ) : pane === "official" ? (
            <CharacterWorkspace
              key={`official-${discovery.data.revision}-${characterId}-${epoch}`}
              draft={discovery.data}
              selected={characterId || discovery.data.characters[0].id}
              onSelect={setCharacterId}
              onDirty={setDirty}
              onReload={reloadDiscovery}
            />
          ) : pane === "home" ? (
            <HomeWorkspace
              key={`home-${discovery.data.revision}-${epoch}`}
              draft={discovery.data}
              onDirty={setDirty}
              onReload={reloadDiscovery}
            />
          ) : (
            <ProductWorkspace
              key={`${pane}-${product.data.revision}-${epoch}`}
              draft={product.data}
              section={pane}
              onDirty={setDirty}
              onReload={reloadProduct}
            />
          )}
        </main>
      </div>
    </div>
  );
}
