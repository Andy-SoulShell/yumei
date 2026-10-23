/** 独立创作工作区：直接接收真实图片/视频任务，复用额度与幂等恢复契约。 */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ImagePlus, Loader2, Sparkles, Video } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { apiErrorMessage } from "@/lib/errors";
import { loginUrl } from "@/lib/navigation";
import {
  formDraftEpoch,
  formDraftKey,
  readFormDraft,
  writeFormDraft,
} from "@/lib/formDrafts";
import {
  beginImageSubmission,
  finishImageSubmission,
  isImageSubmissionUncertain,
} from "@/lib/imageSubmissions";
import { createUuid } from "@/lib/uuid";
import { useDiscovery } from "@/features/discovery/useDiscovery";
import { useProductConfig } from "@/features/product/useProductConfig";
import { acceptsUpload } from "@shared/operationalConfig";
import { getLevelByPoints } from "@shared/intimacy";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ImageTaskCard } from "./ImageTaskCard";
import { VideoMessage } from "./VideoMessage";

const uuid = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value);
export function MediaStudio() {
  const { user } = useAuth();
  return <Studio key={user?.id ?? "guest"} accountId={user?.id} />;
}
function Studio({ accountId }: { accountId?: string }) {
  const { t, locale } = useI18n();
  const [, navigate] = useLocation();
  const search = useSearch();
  const policy = useProductConfig();
  const discovery = useDiscovery();
  const roles = trpc.girlfriend.list.useQuery(undefined, {
    enabled: !!accountId,
  });
  const api = trpc.apiConfig.get.useQuery(undefined, { enabled: !!accountId });
  const quota = trpc.selfie.quota.useQuery(undefined, {
    enabled: !!accountId,
    refetchOnWindowFocus: true,
  });
  const utils = trpc.useUtils();
  const createRole = trpc.girlfriend.createFromPreset.useMutation();
  const resume = trpc.conversation.resume.useMutation();
  const image = trpc.selfie.createTask.useMutation();
  const couple = trpc.selfie.createCoupleTask.useMutation();
  const video = trpc.video.create.useMutation();
  const key = formDraftKey(accountId ?? "guest", "media-studio");
  const [initial] = useState(
    () =>
      readFormDraft(key) ??
      (accountId && new URLSearchParams(search).get("resume") === "1"
        ? readFormDraft(formDraftKey("guest", "media-studio"))
        : null)
  );
  const [prompt, setPrompt] = useState(
    typeof initial?.prompt === "string" ? initial.prompt.slice(0, 8000) : ""
  );
  const [selection, setSelection] = useState(
    typeof initial?.selection === "string" ? initial.selection : ""
  );
  const [mode, setMode] = useState<"reference" | "text">(
    initial?.mode === "text" ? "text" : "reference"
  );
  const [media, setMedia] = useState<"image" | "video">(
    initial?.media === "video" ? "video" : "image"
  );
  const [kind, setKind] = useState<"selfie" | "couple">("selfie");
  const [pose, setPose] = useState("");
  const [duration, setDuration] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [lastImage, setLastImage] = useState<string | null>(
    uuid(initial?.lastImage) ? initial.lastImage : null
  );
  const [lastVideo, setLastVideo] = useState<string | null>(
    uuid(initial?.lastVideo) ? initial.lastVideo : null
  );
  const [videoRequest, setVideoRequest] = useState<{
    id: string;
    signature: string;
  } | null>(() => {
    const v = initial?.videoRequest as
      { id?: unknown; signature?: unknown } | undefined;
    return uuid(v?.id) && typeof v?.signature === "string"
      ? { id: v.id, signature: v.signature }
      : null;
  });
  const lock = useRef(false);
  const scope = useRef({ mounted: true, epoch: formDraftEpoch() });
  useEffect(() => {
    const current = scope.current;
    return () => {
      current.mounted = false;
    };
  }, []);
  useEffect(() => {
    if (scope.current.epoch === formDraftEpoch())
      writeFormDraft(key, {
        prompt,
        selection,
        mode,
        media,
        lastImage,
        lastVideo,
        videoRequest,
      });
  }, [key, prompt, selection, mode, media, lastImage, lastVideo, videoRequest]);
  const options = [
    ...(roles.data ?? []).map(role => ({
      value: `owned:${role.id}`,
      id: role.id,
      presetId: null,
      name: role.name,
      image: role.referenceImageUrl,
      points: role.intimacyPoints,
    })),
    ...(discovery.data?.characters.filter(role => role.listed) ?? [])
      .filter(
        role => !roles.data?.some(owned => owned.officialPresetId === role.id)
      )
      .map(role => ({
        value: `preset:${role.id}`,
        id: null,
        presetId: role.id,
        name: role.name,
        image: role.imageUrl,
        points: 0,
      })),
  ];
  const selected = options.find(role => role.value === selection) ?? options[0];
  const level = policy.raw
    ? getLevelByPoints(selected?.points ?? 0, policy.raw.intimacy.levels).level
    : 1;
  const imageUnavailable =
    !!accountId && api.data?.imageProvider.configured === false;
  const coinInfo =
    quota.data && "coins" in quota.data ? quota.data.coins : null;
  const coinCost =
    coinInfo?.costs[
      media === "video" ? "video" : kind === "couple" ? "couple" : "selfie"
    ] ?? 0;
  const coinsBlocked =
    !!coinInfo && (coinInfo.balance < 0 || coinInfo.balance < coinCost);
  const quotaBlocked =
    !!accountId &&
    (!quota.data ||
      !!quota.error ||
      (!quota.data.unlimited && quota.data.remaining === 0));
  const selectedMode =
    media === "image" &&
    (kind === "couple" ||
      (api.data && !api.data.imageProvider.supportsTextToImage))
      ? "reference"
      : mode;
  const maxLength =
    media === "video"
      ? policy.raw?.runtime.video.maxPromptChars
      : policy.raw?.runtime.chat.maxInputChars;
  const requestInput = async () => {
    if (!selected || !policy.raw) return;
    if (!accountId) {
      navigate(loginUrl("/generate?view=create&resume=1"));
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailure("");
    const current = scope.current;
    const valid = () => current.mounted && current.epoch === formDraftEpoch();
    let clientRequestId: string | undefined;
    try {
      let roleId = selected.id;
      if (!roleId && selected.presetId) {
        const role = await createRole.mutateAsync({
          presetId: selected.presetId,
        });
        if (!valid()) return;
        roleId = role.id;
        void utils.girlfriend.invalidate();
      }
      if (!roleId) throw new Error(t("studio:chooseFirst"));
      const conversation = await resume.mutateAsync({
        girlfriendId: roleId,
        locale,
      });
      if (!valid()) return;
      if (media === "video") {
        const input = {
          conversationId: conversation.id,
          mode,
          prompt: prompt.trim(),
          durationSeconds: Number(
            duration || policy.raw.runtime.video.defaultDurationSeconds
          ),
          referenceMessageId: null,
        };
        const signature = JSON.stringify(input);
        const pending =
          videoRequest?.signature === signature
            ? videoRequest
            : { signature, id: createUuid() };
        setVideoRequest(pending);
        writeFormDraft(key, {
          prompt,
          selection,
          mode,
          media,
          lastImage,
          lastVideo,
          videoRequest: pending,
        });
        await video.mutateAsync({ ...input, clientRequestId: pending.id });
        if (!valid()) return;
        setLastVideo(pending.id);
        setVideoRequest(null);
      } else {
        const input = {
          conversationId: conversation.id,
          userContext: prompt.trim(),
          generationMode: selectedMode,
          ...(pose ? { poseId: pose } : {}),
        };
        const photoBase64 =
          kind === "couple" && photo
            ? await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () =>
                  resolve(String(reader.result).split(",")[1]);
                reader.onerror = () =>
                  reject(new Error(t("auth:networkErrorPleaseTryAgain")));
                reader.readAsDataURL(photo);
              })
            : "";
        if (!valid()) return;
        clientRequestId = beginImageSubmission(
          accountId,
          { conversationId: conversation.id, kind, input },
          photoBase64
        );
        const result =
          kind === "couple"
            ? await couple.mutateAsync({
                clientRequestId,
                conversationId: conversation.id,
                userContext: prompt.trim(),
                userPhotoBase64: photoBase64,
                userPhotoMimeType: photo!.type,
              })
            : await image.mutateAsync({ ...input, clientRequestId });
        if (!valid()) return;
        finishImageSubmission(accountId, clientRequestId);
        setLastImage(result.id);
      }
      if (valid()) {
        void Promise.allSettled([
          utils.selfie.invalidate(),
          utils.conversation.invalidate(),
          utils.billing.getInfo.invalidate(),
        ]);
        toast.success(t("works:accepted"));
      }
    } catch (error) {
      if (!valid()) return;
      const reliable = !isImageSubmissionUncertain(
        error as { data?: { code?: string } }
      );
      if (clientRequestId && reliable)
        finishImageSubmission(accountId, clientRequestId);
      setFailure(
        apiErrorMessage(
          error instanceof Error
            ? error
            : { message: t("auth:networkErrorPleaseTryAgain") },
          t
        )
      );
    } finally {
      lock.current = false;
      if (valid()) setBusy(false);
    }
  };
  const videoEnabled = policy.raw?.models.video.enabled === true;
  const disabled =
    busy ||
    coinsBlocked ||
    !selected ||
    !policy.raw ||
    prompt.length > (maxLength ?? 8000) ||
    (media === "image" &&
      (imageUnavailable || quotaBlocked || (kind === "couple" && !photo))) ||
    (media === "video" &&
      (!videoEnabled ||
        !prompt.trim() ||
        !Number.isFinite(
          Number(duration || policy.raw?.runtime.video.defaultDurationSeconds)
        ) ||
        Number(duration || policy.raw?.runtime.video.defaultDurationSeconds) <
          (policy.raw?.runtime.video.minDurationSeconds ?? 0) ||
        Number(duration || policy.raw?.runtime.video.defaultDurationSeconds) >
          (policy.raw?.runtime.video.maxDurationSeconds ?? 60)));
  return (
    <div className="studio-image-layout">
      <div className="studio-image-form">
        <div
          className="studio-choice-row"
          role="group"
          aria-label={t("works:sections")}
        >
          <Button
            variant="plain"
            aria-pressed={media === "image"}
            onClick={() => setMedia("image")}
            disabled={busy}
          >
            <ImagePlus />
            {t("billing:selfies")}
          </Button>
          <Button
            variant="plain"
            aria-pressed={media === "video"}
            onClick={() => setMedia("video")}
            disabled={busy}
          >
            <Video />
            {t("video:create")}
          </Button>
        </div>
        <label className="studio-builder-field">
          {t("studio:selectCharacter")}
          <select
            className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm"
            value={selected?.value ?? ""}
            disabled={busy}
            onChange={e => {
              setSelection(e.target.value);
              setPose("");
            }}
          >
            {options.map(role => (
              <option key={role.value} value={role.value}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <div className="studio-image-selected">
            <img src={selected.image} alt={selected.name} />
            <div>
              <strong>{selected.name}</strong>
              <p>{t("studio:previewHint")}</p>
            </div>
          </div>
        )}
        <div
          className="studio-choice-row"
          role="group"
          aria-label={t("selfie:generationMode")}
        >
          <Button
            variant="plain"
            aria-pressed={selectedMode === "reference"}
            disabled={busy}
            onClick={() => setMode("reference")}
          >
            {t("selfie:fromReference")}
          </Button>
          {(!accountId ||
            api.data?.imageProvider.supportsTextToImage ||
            media === "video") &&
            kind !== "couple" && (
              <Button
                variant="plain"
                aria-pressed={selectedMode === "text"}
                disabled={busy}
                onClick={() => setMode("text")}
              >
                {t("selfie:fromText")}
              </Button>
            )}
        </div>
        <label className="studio-builder-field">
          {t("studio:imagePrompt")}
          <Textarea
            value={prompt}
            rows={5}
            className="min-h-36 resize-y"
            maxLength={maxLength}
            placeholder={t("studio:imagePromptHint")}
            onChange={e => setPrompt(e.target.value)}
            disabled={busy}
          />
          <span className="text-right text-xs text-muted-foreground">
            {prompt.length}
            {maxLength ? ` / ${maxLength}` : ""}
          </span>
        </label>
        {media === "image" ? (
          <details className="settings-details">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm">
              {t("settings:advancedOptions")}
            </summary>
            <div className="space-y-4 pt-4">
              <div className="studio-choice-row">
                <Button
                  variant="plain"
                  aria-pressed={kind === "selfie"}
                  onClick={() => setKind("selfie")}
                  disabled={busy}
                >
                  {t("works:selfie")}
                </Button>
                <Button
                  variant="plain"
                  aria-pressed={kind === "couple"}
                  onClick={() => {
                    setKind("couple");
                    setMode("reference");
                  }}
                  disabled={busy}
                >
                  {t("works:couple")}
                </Button>
              </div>
              {kind === "couple" ? (
                <label className="studio-builder-field">
                  {t("selfie:uploadYourPhotoToAppearTogether")}
                  <Input
                    type="file"
                    accept={policy.raw?.uploads.couple.mimeTypes.join(",")}
                    disabled={busy}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (
                        file &&
                        policy.raw &&
                        acceptsUpload(policy.raw.uploads.couple, file)
                      ) {
                        setPhoto(file);
                        setFailure("");
                      } else if (file) {
                        setPhoto(null);
                        setFailure(t("studio:invalidUpload"));
                      }
                      e.target.value = "";
                    }}
                  />
                  {photo && (
                    <span className="break-all text-xs">{photo.name}</span>
                  )}
                </label>
              ) : (
                <label className="studio-builder-field">
                  {t("selfie:askForAPhoto")}
                  <select
                    value={pose}
                    onChange={e => setPose(e.target.value)}
                    disabled={busy}
                    className="min-h-11 rounded-xl border bg-background px-3"
                  >
                    <option value="">{t("studio:inherit")}</option>
                    {policy.data?.selfies.poses.map(p => (
                      <option
                        key={p.id}
                        value={p.id}
                        disabled={p.minLevel > level}
                      >
                        {p.emoji} {p.label}
                        {p.minLevel > level
                          ? " · " +
                            t("selfie:unlocksAtIntimacyLv", {
                              level: p.minLevel,
                            })
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </details>
        ) : (
          <label className="studio-builder-field">
            {t("video:duration")}
            <Input
              type="number"
              min={policy.raw?.runtime.video.minDurationSeconds}
              max={policy.raw?.runtime.video.maxDurationSeconds}
              value={
                duration ||
                policy.raw?.runtime.video.defaultDurationSeconds ||
                ""
              }
              onChange={e => setDuration(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        {coinInfo && (
          <div className="space-y-2 text-sm" role="status">
            <p>
              {t("economy:balance")}: {coinInfo.balance} ·{" "}
              {t("economy:cost", { count: coinCost })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("economy:costPolicy")}
            </p>
            <Link href="/wallet" className="underline">
              {t("economy:recharge")}
            </Link>
          </div>
        )}
        {accountId && media === "image" && !coinInfo && (
          <div
            role={quota.error ? "alert" : "status"}
            className="text-xs leading-relaxed"
          >
            {quota.error ? (
              <>
                <p>{t("works:quotaLoadFailed")}</p>
                <Button variant="outline" onClick={() => void quota.refetch()}>
                  {t("explore:retry")}
                </Button>
              </>
            ) : quota.isLoading ? (
              t("auth:working")
            ) : quota.data?.unlimited ? (
              t("works:quotaUnmetered")
            ) : (
              t("works:remaining", { count: quota.data?.remaining ?? 0 })
            )}
          </div>
        )}
        {imageUnavailable && media === "image" && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("studio:imageUnavailable")}{" "}
            <Link href="/settings#image" className="underline">
              {t("common:settings")}
            </Link>
          </p>
        )}
        {media === "video" && !videoEnabled && (
          <p role="status" className="text-xs text-muted-foreground">
            {t("studio:videoUnavailable")}
          </p>
        )}
        {failure && (
          <p role="alert" className="break-words text-sm text-destructive">
            {failure}
          </p>
        )}
        <Button
          className="min-h-12 rounded-full !bg-[image:var(--studio-gradient)] !text-white"
          disabled={disabled}
          onClick={() => void requestInput()}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {t(
            busy
              ? "auth:working"
              : media === "video"
                ? "video:create"
                : "studio:generateImage"
          )}
        </Button>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t(media === "image" ? "studio:imageRefund" : "video:accepted")}
        </p>
      </div>
      <div className="studio-image-results" aria-live="polite">
        {media === "image" && lastImage ? (
          <ImageTaskCard key={lastImage} requestId={lastImage} />
        ) : media === "video" && (lastVideo || videoRequest) ? (
          <VideoMessage
            key={lastVideo ?? videoRequest!.id}
            requestId={lastVideo ?? videoRequest!.id}
          />
        ) : (
          <div className="studio-image-empty">
            <ImagePlus size={40} />
            <h2 className="text-lg font-semibold text-foreground">
              {t("studio:studioEmpty")}
            </h2>
            <p className="max-w-sm leading-relaxed">
              {t("studio:studioEmptyHint")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
