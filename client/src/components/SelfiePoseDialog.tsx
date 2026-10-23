import { acceptsUpload, uploadDescription } from "@shared/operationalConfig";
import { useProductConfig } from "@/features/product/useProductConfig";
import { PageError } from "@/components/PageError";
import { trpc } from "@/lib/trpc";
/** 自拍姿势、生图方式与合照上传的选择弹窗。 */

import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { useRef, useState } from "react";
import { RadioGroup, RadioGroupChoice } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Lock, Users } from "lucide-react";

/**
 * 按亲密度展示姿势解锁状态，并按 Provider 能力展示参考图或文生图选项。
 *
 * @remarks 姿势和合照权限仍由服务端最终校验。
 */
export function SelfiePoseDialog({
  open,
  onOpenChange,
  intimacyLevel,
  canCouplePhoto,
  supportsTextToImage = false,
  onSelectPose,
  onCouplePhoto,
}: {
  /** 受控的展开状态，实际状态由父组件维护。 */
  open: boolean;
  /** 用户请求展开或关闭时触发，由父组件更新 open。 */
  onOpenChange: (open: boolean) => void;
  /** 当前亲密度等级，使用从 1 开始的等级编号。 */
  intimacyLevel: number;
  /** 服务端套餐信息推导的合照可用状态，用于控制前端入口。 */
  canCouplePhoto: boolean;
  /** 当前 Provider 是否支持文生图，默认 false。 */
  supportsTextToImage?: boolean;
  /** 选中已解锁姿势时触发，携带姿势标识和生图模式。 */
  onSelectPose: (poseId: string, generationMode: "reference" | "text") => void;
  /** 用户选定本地合照参考文件时触发，由父组件上传。 */
  onCouplePhoto: (file: File) => void;
}) {
  const { t } = useI18n();
  const policy = useProductConfig();
  const quota = trpc.selfie.quota.useQuery(undefined, {
    enabled: open,
    refetchOnWindowFocus: true,
  });
  const quotaUnavailable =
    quota.isLoading ||
    !!quota.error ||
    !quota.data ||
    (!quota.data.unlimited && quota.data.remaining === 0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);
  const [uploadError, setUploadError] = useState("");
  const [generationMode, setGenerationMode] = useState<"reference" | "text">(
    "reference"
  );
  const selectedMode = supportsTextToImage ? generationMode : "reference";

  if (!policy.data)
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("selfie:askForAPhoto")}</DialogTitle>
          </DialogHeader>
          {policy.error ? (
            <PageError onRetry={() => void policy.refetch()} />
          ) : (
            <p role="status">{t("auth:working")}</p>
          )}
        </DialogContent>
      </Dialog>
    );
  return (
    <Dialog
      open={open}
      onOpenChange={value => {
        setUploadError("");
        onOpenChange(value);
      }}
    >
      <DialogContent
        className="max-w-md overflow-hidden p-0"
        onOpenAutoFocus={event => {
          event.preventDefault();
          dialogTitleRef.current?.focus({ preventScroll: true });
        }}
      >
        <div className="min-h-0 max-h-[var(--dialog-available-height)] space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle ref={dialogTitleRef} tabIndex={-1}>
              {t("selfie:askForAPhoto")}
            </DialogTitle>
            <DialogDescription>
              {t("selfie:unlockPosesAsYouGrowCloserTextIn")}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl bg-muted/50 p-3 text-sm" role="status">
            <p>
              {quota.isLoading
                ? t("auth:working")
                : quota.error
                  ? t("works:quotaLoadFailed")
                  : quota.data?.unlimited
                    ? t("works:quotaUnmetered")
                    : t("works:remaining", {
                        count: quota.data?.remaining ?? 0,
                      })}
            </p>
            {quota.data && !quota.data.unlimited && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("works:quotaBefore")}
              </p>
            )}
            {quota.error && (
              <Button
                variant="outline"
                className="mt-2 min-h-11"
                onClick={() => void quota.refetch()}
              >
                {t("explore:retry")}
              </Button>
            )}
          </div>

          {supportsTextToImage && (
            <div className="space-y-2">
              <RadioGroup
                className="grid grid-cols-2 gap-2"
                aria-label={t("selfie:generationMode")}
                value={selectedMode}
                onValueChange={value =>
                  setGenerationMode(value as "reference" | "text")
                }
              >
                <RadioGroupChoice variant="segment" value="reference">
                  {t("selfie:fromReference")}
                </RadioGroupChoice>
                <RadioGroupChoice variant="segment" value="text">
                  {t("selfie:fromText")}
                </RadioGroupChoice>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                {selectedMode === "reference"
                  ? t("selfie:usesTheCharacterReferenceToHelpKeepThe")
                  : t(
                      "selfie:generatesFromTheCharacterDescriptionAndSceneText"
                    )}
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {policy.data.selfies.poses.map(pose => {
              const locked = pose.minLevel > intimacyLevel;
              return (
                <Button
                  variant="plain"
                  size="none"
                  type="button"
                  key={pose.id}
                  disabled={locked || quotaUnavailable}
                  title={
                    locked
                      ? t("selfie:unlocksAtIntimacyLv", {
                          level: pose.minLevel,
                        })
                      : pose.label
                  }
                  className={`flex min-w-0 flex-col items-center gap-1 whitespace-normal rounded-2xl p-2 sm:p-3 text-sm transition-colors ${
                    locked
                      ? "opacity-45 cursor-not-allowed bg-muted/40"
                      : "bg-muted/40 hover:bg-primary/10"
                  }`}
                  onClick={() => {
                    onSelectPose(pose.id, selectedMode);
                    onOpenChange(false);
                  }}
                >
                  <span className="text-2xl leading-none">{pose.emoji}</span>
                  <span className="min-h-10 w-full break-words text-center leading-5">
                    {pose.label}
                  </span>
                  {locked ? (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 gap-0.5"
                    >
                      <Lock className="w-2.5 h-2.5" />
                      {t("common:lv")}
                      {pose.minLevel}
                    </Badge>
                  ) : (
                    <span className="text-[10px] text-transparent select-none">
                      ·
                    </span>
                  )}
                </Button>
              );
            })}
          </div>

          <div className="pt-3">
            <Input
              ref={fileInputRef}
              type="file"
              accept={policy.raw?.uploads.couple.mimeTypes.join(",")}
              disabled={!policy.raw}
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) {
                  if (
                    !policy.raw ||
                    !acceptsUpload(policy.raw.uploads.couple, file)
                  ) {
                    setUploadError(
                      t(
                        "selfie:invalidCoupleImage",
                        policy.raw
                          ? uploadDescription(policy.raw.uploads.couple)
                          : { formats: "", maxSize: "" }
                      )
                    );
                    return;
                  }
                  setUploadError("");
                  onCouplePhoto(file);
                  onOpenChange(false);
                }
                e.target.value = "";
              }}
            />
            {uploadError && (
              <p role="alert" className="mb-2 text-sm text-destructive">
                {uploadError}
              </p>
            )}
            <Button
              variant="outline"
              className="h-auto min-h-11 w-full whitespace-normal py-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canCouplePhoto || quotaUnavailable}
              title={
                canCouplePhoto
                  ? t("selfie:uploadYourPhotoToAppearTogether")
                  : t("selfie:couplePhotosRequireEligiblePlan")
              }
            >
              <Users className="w-4 h-4 mr-1.5" />
              {t("selfie:couplePhotoUploadYourPhotoToAppearTogether")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
