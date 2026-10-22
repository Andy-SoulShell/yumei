/** 全局设置与角色编辑共用的参考录音上传、校验和克隆重试表单。 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { OMNIVOICE_REFERENCE_MAX_BYTES } from "@shared/omnivoice";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Translator } from "@shared/i18n";

/** 私人音色的公开摘要，durationMs 为参考录音时长，不包含录音字节。 */
export type ClonedVoice = { id: string; name: string; durationMs: number };
type Props = {
  t: Translator;
  onCreated: (voice: ClonedVoice) => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  defaultName?: string;
  idPrefix?: string;
  submitLabel?: string;
  successMessage: string;
};

/** 上传参考录音并交由调用方使用音色；绑定失败时复用已创建音色重试。 */
export function OmniVoiceCloneForm({
  t,
  onCreated,
  onBusyChange,
  disabled,
  defaultName = "",
  idPrefix = "omnivoice",
  submitLabel,
  successMessage,
}: Props) {
  const createVoice = trpc.tts.createOmnivoiceVoice.useMutation();
  const [nameDraft, setNameDraft] = useState<string>();
  const name = nameDraft ?? defaultName;
  const [text, setText] = useState("");
  const [file, setFile] = useState<File>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const readerRef = useRef<FileReader | null>(null);
  const createdRef = useRef<ClonedVoice | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      readerRef.current?.abort();
      if (busyRef.current) busyCallback.current?.(false);
    };
  }, []);

  async function cloneVoice() {
    if (!file || disabled || busyRef.current || !name.trim() || !text.trim())
      return;
    busyRef.current = true;
    setBusy(true);
    busyCallback.current?.(true);
    setError("");
    try {
      if (!createdRef.current) {
        const audio = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          readerRef.current = reader;
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = reader.onabort = () =>
            reject(new Error(t("settings:omnivoiceUploadInvalid")));
          reader.readAsDataURL(file);
        });
        if (!mounted.current) return;
        createdRef.current = await createVoice.mutateAsync({
          name: name.trim(),
          text: text.trim(),
          audio,
        });
      }
      if (!mounted.current) return;
      await onCreated(createdRef.current);
      if (!mounted.current) return;
      createdRef.current = null;
      setFile(undefined);
      setNameDraft(undefined);
      setText("");
      if (fileInput.current) fileInput.current.value = "";
      toast.success(successMessage);
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : t("settings:omnivoiceCloneFailed")
        );
    } finally {
      if (mounted.current) {
        busyRef.current = false;
        setBusy(false);
        busyCallback.current?.(false);
      }
    }
  }

  return (
    <div
      className="space-y-3"
      onKeyDown={event => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement)
          event.preventDefault();
      }}
    >
      <p className="text-xs text-muted-foreground">
        {t("settings:omnivoiceCloneHint")}
      </p>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-clone-name`}>
          {t("settings:omnivoiceCloneName")}
        </Label>
        <Input
          id={`${idPrefix}-clone-name`}
          value={name}
          maxLength={80}
          disabled={busy || disabled}
          onChange={event => {
            createdRef.current = null;
            setNameDraft(event.target.value);
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-clone-file`}>
          {t("settings:omnivoiceReferenceAudio")}
        </Label>
        <Input
          id={`${idPrefix}-clone-file`}
          ref={fileInput}
          type="file"
          accept=".wav,.mp3,.flac,.ogg,audio/wav,audio/mpeg,audio/flac,audio/ogg"
          disabled={busy || disabled}
          onChange={event => {
            createdRef.current = null;
            const chosen = event.target.files?.[0];
            setError("");
            if (
              chosen &&
              (!/\.(wav|mp3|flac|ogg)$/i.test(chosen.name) ||
                !chosen.size ||
                chosen.size > OMNIVOICE_REFERENCE_MAX_BYTES)
            ) {
              setFile(undefined);
              event.target.value = "";
              setError(t("settings:omnivoiceUploadInvalid"));
            } else setFile(chosen);
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-reference-text`}>
          {t("settings:omnivoiceReferenceText")}
        </Label>
        <Textarea
          id={`${idPrefix}-reference-text`}
          value={text}
          maxLength={2000}
          disabled={busy || disabled}
          onChange={event => {
            createdRef.current = null;
            setText(event.target.value);
          }}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || busy || !file || !name.trim() || !text.trim()}
        onClick={() => void cloneVoice()}
      >
        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {submitLabel ?? t("settings:omnivoiceCreateClone")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
