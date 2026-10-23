import { SupportInbox } from "@/features/management/SupportInbox";
/** 单密码运营后台：直接调用既有管理 API 编辑草稿、校验并发布。 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  managementRoute,
  managementPath,
} from "@/features/management/managementRoutes";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import {
  ArrowLeft,
  ChevronRight,
  Code2,
  FileText,
  Loader2,
  LockKeyhole,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Menu,
  Sun,
  Moon,
} from "lucide-react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { trpc } from "@/lib/trpc";
import { useProductConfig } from "@/features/product/useProductConfig";
import { productConfigSchema, type ProductConfig } from "@shared/productConfig";
import { homepageSchema, officialCharacterSchema } from "@shared/discovery";
import { fieldLabel, type FormSchema } from "@/features/management/ConfigForm";
import { ProductExperience } from "@/features/management/ProductExperience";
import { useOfficialUpload } from "@/features/management/useOfficialUpload";
import { sameConfigValue } from "@/features/management/editorState";
import { CharacterExperience } from "@/features/management/CharacterExperience";
import { HomeExperience } from "@/features/management/HomeExperience";
import { OfficialCharacterPreview } from "@/features/management/OfficialCharacterPreview";
import { DiscoveryPublishReview } from "@/features/management/DiscoveryPublishReview";
import {
  createOfficialCharacter,
  prepareOfficialCharacter,
  officialCharacterIssues,
  discoveryPublicationReview,
} from "@/features/management/officialEditor";
import "@/features/management/management.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ManagementNavigation,
  ManagementDock,
  managementMenu,
} from "@/features/management/ManagementNavigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";

import { sections, type Pane } from "@/features/management/managementModel";
import {
  createSettingsView,
  type SettingsNavigation,
  type SettingsViewState,
} from "@/features/management/settingsModel";
import type {
  ProductDraft,
  DiscoveryDraft,
  WorkspaceOperations,
} from "@/features/management/types";
import { homepageIssues } from "@/features/management/HomepageEditor";
import { OfficialLibrary } from "@/features/management/OfficialLibrary";
import { ContentOverview } from "@/features/management/ContentOverview";
import { PublishingCenter } from "@/features/management/PublishingCenter";
import { ProductPublishReview } from "@/features/management/ProductPublishReview";
const productForm = z.toJSONSchema(productConfigSchema, {
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
    .map(
      item =>
        `${item.path.map(part => fieldLabel(String(part))).join(" · ") || "配置"}：${item.message}`
    )
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
  pending,
  busy,
  dirty,
  onSave,
  onPublish,
  onReload,
  saveDisabled = false,
  publishLabel = "发布",
}: {
  title: string;
  description: string;
  pending: boolean;
  busy: boolean;
  dirty: boolean;
  onSave: () => void;
  onPublish: () => void;
  onReload: () => void;
  saveDisabled?: boolean;
  publishLabel?: string;
}) {
  return (
    <>
      <div className="admin-workspace-heading">
        <div className="min-w-0">
          <h1 className="admin-title">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        <Badge
          className="admin-draft-badge"
          variant={dirty || pending ? "outline" : "secondary"}
        >
          {dirty ? "有未保存修改" : pending ? "草稿待发布" : "已发布"}
        </Badge>
      </div>
      {(dirty || pending || busy) && (
        <div className="admin-workspace-toolbar">
          <span className="admin-save-status" role="status" aria-live="polite">
            <span
              className="admin-status-dot"
              data-pending={dirty || pending || undefined}
            />
            {busy
              ? "正在处理，请稍候…"
              : dirty
                ? "修改尚未保存"
                : pending
                  ? "草稿已保存，发布后用户可见"
                  : "已与公开版本同步"}
          </span>
          <div className="management-actions">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={onReload}
            >
              <RefreshCw className="mr-1.5 size-3.5" />
              重新读取
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !dirty || saveDisabled}
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
              disabled={busy || dirty || !pending}
              onClick={onPublish}
              title={dirty ? "请先保存草稿" : undefined}
            >
              <Send className="mr-1.5 size-3.5" />
              {publishLabel}
            </Button>
          </div>
        </div>
      )}
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
    <details
      className="admin-editor-mode admin-config-group"
      open={mode === "json"}
    >
      <summary className="cursor-pointer text-xs text-muted-foreground">
        高级编辑
      </summary>
      <div className="mt-3 flex w-fit gap-1 rounded-lg bg-muted/50 p-1">
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
    </details>
  );
}
function ErrorText({ error, id }: { error: string; id?: string }) {
  return error ? (
    <p
      id={id}
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
  content,
  section,
  onReload,
  onDirty,
  operations,
  view,
  onViewChange,
}: {
  draft: ProductDraft;
  content: DiscoveryDraft;
  section: keyof ProductConfig;
  onReload: () => Promise<unknown>;
  onDirty: (dirty: boolean) => void;
  operations: WorkspaceOperations;
} & SettingsNavigation) {
  const [value, setValue] = useState(() => structuredClone(draft.config));
  const [mode, setMode] = useState<"form" | "json">("form");
  const [raw, setRaw] = useState(() => JSON.stringify(value[section], null, 2));
  const [error, setError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  let issues: string[] = [];
  const fieldIssues: Record<string, string> = {};
  try {
    const parsed = productConfigSchema.safeParse(
      mode === "json" ? { ...value, [section]: JSON.parse(raw) } : value
    );
    if (!parsed.success) {
      issues = validation(parsed.error).split("\n");
      for (const issue of parsed.error.issues)
        fieldIssues[issue.path.join(".")] = issue.message;
    }
  } catch {
    issues = ["JSON 格式无效，请修正后保存。"];
  }
  const save = trpc.productConfig.admin.save.useMutation(),
    publish = trpc.productConfig.admin.publish.useMutation();
  const utils = trpc.useUtils();
  const dirty =
    !sameConfigValue(value, draft.config) ||
    (mode === "json" && raw !== JSON.stringify(value[section], null, 2));
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const busy = operations.busy || save.isPending || publish.isPending,
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
        pending={!sameConfigValue(draft.config, draft.published)}
        busy={busy}
        dirty={dirty}
        saveDisabled={issues.length > 0}
        onSave={() => void operations.run(submit)}
        publishLabel="查看设置变更"
        onPublish={() => {
          setError("");
          setReviewOpen(true);
        }}
        onReload={() => {
          if (!dirty || window.confirm("放弃当前未保存的修改并重新读取？"))
            void operations
              .run(onReload)
              .catch(error => setError(message(error)));
        }}
      />
      <ErrorText error={error} />
      {reviewOpen && (
        <ProductPublishReview
          config={draft.config}
          published={draft.published}
          characters={content.published.characters}
          busy={busy}
          error={error}
          onClose={() => setReviewOpen(false)}
          onPublish={() => void operations.run(publishDraft)}
        />
      )}
      {issues.length > 0 && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
        >
          {issues.map((issue, index) => (
            <p key={index}>{issue}</p>
          ))}
        </div>
      )}
      {mode === "form" ? (
        <ProductExperience
          section={section}
          config={value}
          rootSchema={productForm}
          issues={fieldIssues}
          busy={busy}
          dirty={dirty}
          error={error}
          view={view}
          onViewChange={onViewChange}
          onChange={next => {
            setValue(next);
            setError("");
          }}
          onSave={() => void operations.run(submit)}
        />
      ) : (
        <Card className="admin-editor-card">
          <CardContent className="p-4 sm:p-6">
            <Textarea
              aria-label={`${info.name} JSON`}
              value={raw}
              onChange={event => {
                setRaw(event.target.value);
                setError("");
              }}
              disabled={busy}
              spellCheck={false}
              className="min-h-[60vh] resize-y font-mono text-xs leading-6"
            />
          </CardContent>
        </Card>
      )}
      <div className="mt-8">
        <EditorMode mode={mode} setMode={switchMode} disabled={busy} />
      </div>
    </>
  );
}
function HomeWorkspace({
  draft,
  onReload,
  onDirty,
  operations,
}: {
  draft: DiscoveryDraft;
  onReload: () => Promise<unknown>;
  onDirty: (dirty: boolean) => void;
  operations: WorkspaceOperations;
}) {
  const [value, setValue] = useState(() => structuredClone(draft.home));
  const policy = useProductConfig();
  const pending = useMemo(
    () =>
      policy.raw
        ? discoveryPublicationReview(draft, policy.raw.characters).changed
        : draft.revision !== draft.publishedRevision,
    [draft, policy.raw]
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [mode, setMode] = useState<"form" | "json">("form"),
    [raw, setRaw] = useState(() => JSON.stringify(value, null, 2)),
    [error, setError] = useState("");
  const save = trpc.discovery.admin.saveHomepage.useMutation(),
    publish = trpc.discovery.admin.publish.useMutation(),
    utils = trpc.useUtils();
  const imageUpload = useOfficialUpload(setError);
  const busy =
    operations.busy ||
    save.isPending ||
    publish.isPending ||
    imageUpload.pending;
  const dirty =
    !sameConfigValue(value, draft.home) ||
    (mode === "json" && raw !== JSON.stringify(value, null, 2));
  let issues: string[];
  try {
    issues = homepageIssues(
      mode === "json" ? JSON.parse(raw) : value,
      draft.characters
    );
  } catch {
    issues = ["JSON 格式无效，请修正后保存。"];
  }
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
        description="挑选精选角色，编排轮播与问答，预览后再发布。"
        pending={pending}
        busy={busy}
        dirty={dirty}
        saveDisabled={issues.length > 0}
        onSave={() => void operations.run(submit)}
        publishLabel="查看发布变更"
        onPublish={() => {
          setError("");
          setReviewOpen(true);
        }}
        onReload={() => {
          if (!dirty || window.confirm("放弃未保存修改？"))
            void operations
              .run(onReload)
              .catch(error => setError(message(error)));
        }}
      />
      <ErrorText error={error} />
      {issues.length > 0 && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
        >
          {issues.map((issue, index) => (
            <p key={index}>{issue}</p>
          ))}
        </div>
      )}
      {reviewOpen && policy.raw && (
        <DiscoveryPublishReview
          open
          onClose={() => setReviewOpen(false)}
          draft={draft}
          rules={policy.raw.characters}
          busy={busy}
          error={error}
          onPublish={() => void operations.run(publishDraft)}
        />
      )}
      <Card className="admin-editor-card">
        <CardContent className="p-4 sm:p-6">
          {mode === "form" ? (
            <HomeExperience
              dirty={dirty}
              error={error}
              invalid={issues.length > 0}
              onSave={() => void operations.run(submit)}
              value={value}
              rows={draft.characters}
              busy={busy}
              onUpload={file =>
                operations.run(() => imageUpload.uploadFile(file))
              }
              uploadAccept={imageUpload.accept}
              onChange={next => {
                setValue(next);
                setError("");
              }}
            />
          ) : (
            <Textarea
              aria-label="首页内容 JSON"
              value={raw}
              disabled={busy}
              onChange={event => {
                setRaw(event.target.value);
                setError("");
              }}
              spellCheck={false}
              className="min-h-[60vh] font-mono text-xs leading-6"
            />
          )}
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
                  setError("");
                } catch {
                  setError("JSON 格式无效");
                }
              }
            }}
          />
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
  operations,
}: {
  draft: DiscoveryDraft;
  selected: string;
  onSelect: (id: string) => void;
  onReload: () => Promise<unknown>;
  onDirty: (dirty: boolean) => void;
  operations: WorkspaceOperations;
}) {
  const policy = useProductConfig(),
    source = draft.characters.find(item => item.id === selected);
  const pending = useMemo(
    () =>
      policy.raw
        ? discoveryPublicationReview(draft, policy.raw.characters).changed
        : draft.revision !== draft.publishedRevision,
    [draft, policy.raw]
  );
  const [value, setValue] = useState(() => {
      if (source) return structuredClone(source.data);
      if (selected.startsWith("copy:")) {
        const original = draft.characters.find(
          item => item.id === selected.slice(5)
        )?.data;
        if (original)
          return {
            ...structuredClone(original),
            id: `character-${crypto.randomUUID().slice(0, 8)}`,
            name: `${original.name} 副本`.slice(
              0,
              Math.min(100, policy.raw!.characters.limits.name)
            ),
            sortOrder: Math.min(
              100000,
              Math.max(...draft.characters.map(item => item.data.sortOrder)) + 1
            ),
          };
      }
      const template =
        draft.characters.find(item => item.id === draft.home.defaultPresetId)
          ?.data || draft.characters[0].data;
      return createOfficialCharacter(
        template,
        policy.raw!.characters,
        Math.min(
          100000,
          Math.max(...draft.characters.map(item => item.data.sortOrder)) + 1
        )
      );
    }),
    [error, setError] = useState(""),
    [reviewOpen, setReviewOpen] = useState(false);
  const candidate = prepareOfficialCharacter(value);
  const issues = policy.raw
    ? officialCharacterIssues(candidate, policy.raw.characters)
    : {};
  const save = trpc.discovery.admin.saveCharacter.useMutation(),
    archive = trpc.discovery.admin.archiveCharacter.useMutation(),
    publish = trpc.discovery.admin.publish.useMutation(),
    utils = trpc.useUtils();
  const imageUpload = useOfficialUpload(setError);
  const dirty = !source || !sameConfigValue(value, source.data);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const busy =
    operations.busy ||
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
      const parsed = officialCharacterSchema.safeParse(candidate);
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
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => select("")}
        >
          <ArrowLeft className="size-4" />
          返回角色库
        </Button>
        {source && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || dirty}
            onClick={() => select(`copy:${source.id}`)}
          >
            复制为新角色
          </Button>
        )}
      </div>
      <WorkspaceHeader
        title="官方角色"
        description="填写角色资料 → 保存草稿 → 预览并核对变更 → 发布。只有名字和人物设定必填。"
        pending={pending}
        busy={busy}
        dirty={dirty}
        onSave={() => void operations.run(submit)}
        saveDisabled={!policy.raw || Object.keys(issues).length > 0}
        publishLabel="查看发布变更"
        onPublish={() => {
          setError("");
          setReviewOpen(true);
        }}
        onReload={() => {
          if (!dirty || window.confirm("放弃未保存修改？"))
            void operations
              .run(onReload)
              .catch(error => setError(message(error)));
        }}
      />
      <ErrorText error={error} />
      {reviewOpen && policy.raw && (
        <DiscoveryPublishReview
          open
          onClose={() => setReviewOpen(false)}
          draft={draft}
          rules={policy.raw.characters}
          busy={busy}
          error={error}
          onPublish={() => void operations.run(publishDraft)}
        />
      )}
      <div className="space-y-4">
        <Card className="self-start py-0">
          <CardContent className="admin-character-switcher flex flex-wrap items-center gap-3 p-3">
            <Button
              className="shrink-0"
              variant="outline"
              disabled={busy || !policy.raw || !source}
              onClick={newCharacter}
            >
              <Plus className="mr-1.5 size-4" />
              新增角色
            </Button>
            <select
              aria-label="选择官方角色"
              value={source ? selected : "new"}
              disabled={busy}
              onChange={event => select(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm"
            >
              {!source && <option value="new">新角色草稿</option>}
              {draft.characters.map(item => (
                <option key={item.id} value={item.id}>
                  {item.data.name}
                  {item.archived ? "（已归档）" : ""}
                </option>
              ))}
            </select>
            <Button asChild variant="ghost" size="sm">
              <a href="#official-preview">查看预览</a>
            </Button>
          </CardContent>
        </Card>
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Card className="min-w-0 py-0">
            <CardContent className="admin-character-fields space-y-4 p-4 sm:p-6">
              <div className="flex flex-wrap items-center gap-3">
                <p className="mr-auto text-xs text-muted-foreground">
                  {source?.archived
                    ? "已归档"
                    : !source
                      ? "新角色 · 尚未保存"
                      : "编辑后先保存，确认变更再发布"}
                </p>
                {source && !source.archived && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={
                      busy || dirty || source.id === draft.home.defaultPresetId
                    }
                    onClick={() => {
                      void operations
                        .run(() =>
                          archive
                            .mutateAsync({
                              expectedRevision: draft.revision,
                              id: source.id,
                            })
                            .then(() => onReload())
                        )
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
                    disabled={busy || Object.keys(issues).length > 0}
                    onClick={() => void operations.run(submit)}
                  >
                    恢复到草稿
                  </Button>
                )}
              </div>
              {policy.raw ? (
                <CharacterExperience
                  dirty={dirty}
                  error={error}
                  creating={!source}
                  onSave={() => void operations.run(submit)}
                  value={value}
                  issues={issues}
                  rules={policy.raw.characters}
                  uploadRule={policy.raw.uploads.official}
                  busy={busy}
                  uploading={imageUpload.pending}
                  images={Array.from(
                    new Map(
                      draft.characters
                        .filter(item => !item.archived)
                        .map(item => [
                          item.data.imageUrl,
                          {
                            imageUrl: item.data.imageUrl,
                            name: item.data.name,
                          },
                        ])
                    ).values()
                  )}
                  onUpload={file => void operations.run(() => uploadFile(file))}
                  onChange={next => {
                    setValue(next);
                    setError("");
                  }}
                />
              ) : (
                <p role="status" className="text-sm text-muted-foreground">
                  正在读取字段规则，请稍候…
                </p>
              )}
            </CardContent>
          </Card>
          <div
            id="official-preview"
            className="min-w-0 scroll-mt-36 xl:sticky xl:top-36"
          >
            <OfficialCharacterPreview
              value={candidate}
              archived={source?.archived}
            />
          </div>
        </div>
      </div>
    </>
  );
}
/** 路由保持与用户登录独立，所有状态和写入都由服务端会话判定。 */
export default function Management() {
  const [routeLocation] = useLocation();
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
      cache.removeQueries({ queryKey: getQueryKey(trpc.support.admin) });
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
      cache.removeQueries({ queryKey: getQueryKey(trpc.support.admin) });
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
        <Card className="py-0">
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
                aria-invalid={!!error}
                aria-describedby={error ? "management-login-error" : undefined}
                value={password}
                onChange={event => setPassword(event.target.value)}
                disabled={login.isPending || !session.data?.configured}
              />
              <ErrorText id="management-login-error" error={error} />
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
  if (routeLocation === "/admin/support")
    return <SupportInbox onLogout={() => void signOut()} />;
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
  const [location, setLocation] = useLocation();
  const initialRoute = useRef(managementRoute(location));
  const previousLocation = useRef(location);
  const shell = useRef<HTMLDivElement>(null);
  const [settingsViews, setSettingsViews] = useState<
    Record<string, SettingsViewState>
  >(() =>
    Object.fromEntries(
      sections.map(section => [section.id, createSettingsView()])
    )
  );
  const [pane, setPane] = useState<Pane>(initialRoute.current.pane),
    [dirty, setDirty] = useState(false),
    [epoch, setEpoch] = useState(0),
    [characterId, setSelectedCharacter] = useState(
      initialRoute.current.characterId
    ),
    [navSearch, setNavSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia?.("(min-width: 901px)");
    if (!media) return;
    const closeOnDesktop = () => {
      if (media.matches) setMenuOpen(false);
    };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);
  const [libraryState, setLibraryState] = useState({
    query: "",
    filter: "all",
    sort: "order",
  });
  const [operationBusy, setOperationBusy] = useState(false);
  const pendingOperations = useRef(0);
  // 锁定覆盖完整的上传/写入、公开缓存更新和草稿重读，避免迟到刷新重挂其他编辑器。
  const runOperation = useCallback(async <T,>(work: () => Promise<T>) => {
    pendingOperations.current++;
    setOperationBusy(true);
    try {
      return await work();
    } finally {
      pendingOperations.current--;
      setOperationBusy(pendingOperations.current > 0);
    }
  }, []);
  useEffect(() => {
    shell.current
      ?.closest<HTMLElement>("[data-management-scroll]")
      ?.scrollTo({ top: 0, behavior: "instant" });
  }, [pane, characterId]);
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
  // Query 缓存通知可能晚于 refetch 的 Promise；数据应用到组件前继续保护编辑器。
  const busy = operationBusy || product.isFetching || discovery.isFetching;
  const operations: WorkspaceOperations = { busy, run: runOperation };
  useEffect(() => {
    if (
      product.error?.data?.code === "FORBIDDEN" ||
      discovery.error?.data?.code === "FORBIDDEN"
    )
      onExpired();
  }, [product.error, discovery.error, onExpired]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  const navigate = (next: Pane) => {
    if (pendingOperations.current || busy) return false;
    if (next === pane && next !== "official") {
      if (window.location.search) setLocation(managementPath(next));
      return true;
    }
    if (dirty && !window.confirm("当前有未保存的修改，放弃并切换？"))
      return false;
    setDirty(false);
    if (next === "official") setSelectedCharacter("");
    setPane(next);
    const path = managementPath(next);
    previousLocation.current = path;
    setLocation(path);
    return true;
  };
  const setCharacterId = (id: string) => {
    setSelectedCharacter(id);
    const path =
      managementPath("official", id) +
      (id === "new" || id.startsWith("copy:") ? "?edit=basic" : "");
    previousLocation.current = path;
    setLocation(path);
  };
  useEffect(() => {
    const next = managementRoute(location);
    if (next.pane === pane && next.characterId === characterId) {
      previousLocation.current = location;
      return;
    }
    if (
      busy ||
      (dirty && !window.confirm("当前有未保存的修改，放弃并返回其他页面？"))
    ) {
      setLocation(previousLocation.current, { replace: true });
      return;
    }
    setDirty(false);
    setPane(next.pane);
    setSelectedCharacter(next.characterId);
    previousLocation.current = location;
  }, [location, pane, characterId, dirty, busy, setLocation]);
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
  const active = managementMenu.find(item => item.id === pane)!;
  const navigation = (mobile = false) => (
    <ManagementNavigation
      pane={pane}
      query={navSearch}
      onQueryChange={setNavSearch}
      busy={busy}
      onNavigate={next => {
        if (navigate(next) && mobile) setMenuOpen(false);
      }}
    />
  );
  const ready = product.data && discovery.data;
  return (
    <div ref={shell} className="admin-shell">
      <a className="skip-link" href="#management-content">
        跳转到正文
      </a>
      <header className="admin-header">
        <div className="admin-header-start">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                className="admin-mobile-menu"
                variant="ghost"
                size="icon"
                disabled={busy}
                aria-label="打开管理导航"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="admin-nav-sheet">
              <SheetHeader>
                <SheetTitle>管理导航</SheetTitle>
                <SheetDescription>内容、品牌、业务与系统设置</SheetDescription>
              </SheetHeader>
              {navigation(true)}
            </SheetContent>
          </Sheet>
          <span className="admin-wordmark">
            YUMEI<span>.</span>
          </span>
          <span className="admin-header-divider" />
          <span className="admin-header-label">
            <ShieldCheck className="size-3.5" />
            管理后台
          </span>
        </div>
        <div className="admin-breadcrumb" aria-label="当前位置">
          <span>{active.group}</span>
          <ChevronRight className="size-3.5" />
          <strong>{active.name}</strong>
        </div>
        <div className="admin-header-actions">
          <Button asChild variant="ghost" size="sm">
            <Link
              href="/admin/support"
              onClick={event => {
                if (
                  busy ||
                  (dirty && !window.confirm("放弃未保存修改并打开客服工单？"))
                )
                  event.preventDefault();
              }}
            >
              客服工单
            </Link>
          </Button>
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
              aria-disabled={busy}
              onClick={event => {
                if (
                  pendingOperations.current ||
                  busy ||
                  (dirty && !window.confirm("放弃未保存修改并返回站点？"))
                )
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
            disabled={busy}
            onClick={() => {
              if (pendingOperations.current || busy) return;
              if (!dirty || window.confirm("放弃未保存修改并退出？"))
                onLogout();
            }}
          >
            <LogOut className="size-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">退出</span>
          </Button>
        </div>
      </header>
      <div className="admin-layout">
        <aside className="admin-sidebar">{navigation()}</aside>
        <main id="management-content" tabIndex={-1} className="admin-main">
          <div className="admin-mobile-context">
            <span>{active.group}</span>
            <ChevronRight className="size-3" />
            <span>{active.name}</span>
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
            <ContentOverview
              content={discovery.data}
              product={product.data}
              busy={busy}
              onNavigate={navigate}
              onEdit={id => {
                navigate("official");
                setCharacterId(id);
              }}
              onNew={() => {
                navigate("official");
                setCharacterId("new");
              }}
            />
          ) : pane === "publish" ? (
            <PublishingCenter
              content={discovery.data}
              product={product.data}
              operations={operations}
              onContentReload={reloadDiscovery}
              onProductReload={reloadProduct}
            />
          ) : pane === "official" && !characterId ? (
            <OfficialLibrary
              state={libraryState}
              onStateChange={setLibraryState}
              rows={discovery.data.characters}
              published={discovery.data.published.characters}
              busy={busy}
              onSelect={setCharacterId}
              onNew={() => setCharacterId("new")}
              onPublish={() => navigate("publish")}
            />
          ) : pane === "official" &&
            characterId !== "new" &&
            !discovery.data.characters.some(
              item => item.id === characterId.replace(/^copy:/, "")
            ) ? (
            <div className="admin-empty">
              <h1 className="admin-title">没有找到这个角色</h1>
              <p className="my-4">角色可能已被移除，请回到角色库重新选择。</p>
              <Button variant="outline" onClick={() => setCharacterId("")}>
                返回角色库
              </Button>
            </div>
          ) : pane === "official" ? (
            <CharacterWorkspace
              key={`official-${discovery.data.revision}-${characterId}-${epoch}`}
              draft={discovery.data}
              selected={characterId || discovery.data.characters[0].id}
              onSelect={setCharacterId}
              onDirty={setDirty}
              onReload={reloadDiscovery}
              operations={operations}
            />
          ) : pane === "home" ? (
            <HomeWorkspace
              key={`home-${discovery.data.revision}-${epoch}`}
              draft={discovery.data}
              onDirty={setDirty}
              onReload={reloadDiscovery}
              operations={operations}
            />
          ) : (
            <ProductWorkspace
              key={`${pane}-${product.data.revision}-${epoch}`}
              draft={product.data}
              content={discovery.data}
              section={pane}
              view={settingsViews[pane]}
              onViewChange={next =>
                setSettingsViews(old => ({ ...old, [pane]: next }))
              }
              onDirty={setDirty}
              onReload={reloadProduct}
              operations={operations}
            />
          )}
        </main>
      </div>
      <ManagementDock
        pane={pane}
        busy={busy}
        onNavigate={navigate}
        menuOpen={menuOpen}
        onOpenMenu={() => setMenuOpen(true)}
      />
    </div>
  );
}
