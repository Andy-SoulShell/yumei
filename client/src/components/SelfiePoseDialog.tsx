import { poseMessages } from "@/locales/domain";
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
import { SELFIE_POSES } from "../../../shared/selfiePoses";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState("");
  const [generationMode, setGenerationMode] = useState<"reference" | "text">(
    "reference"
  );
  const selectedMode = supportsTextToImage ? generationMode : "reference";

  return (
    <Dialog
      open={open}
      onOpenChange={value => {
        setUploadError("");
        onOpenChange(value);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("selfie:askForAPhoto")}</DialogTitle>
          <DialogDescription>
            {t("selfie:unlockPosesAsYouGrowCloserTextIn")}
          </DialogDescription>
        </DialogHeader>

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
                : t("selfie:generatesFromTheCharacterDescriptionAndSceneText")}
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {SELFIE_POSES.map(pose => {
            const locked = pose.minLevel > intimacyLevel;
            return (
              <Button
                variant="plain"
                size="none"
                type="button"
                key={pose.id}
                disabled={locked}
                title={
                  locked
                    ? t("selfie:unlocksAtIntimacyLv", { level: pose.minLevel })
                    : t(poseMessages[pose.id])
                }
                className={`flex flex-col items-center gap-1 rounded-2xl p-3 text-sm transition-colors ${
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
                <span className="truncate w-full text-center">
                  {t(poseMessages[pose.id])}
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
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) {
                if (
                  !["image/jpeg", "image/png", "image/webp"].includes(
                    file.type
                  ) ||
                  !file.size ||
                  file.size > 10 * 1024 * 1024
                ) {
                  setUploadError(t("selfie:invalidCoupleImage"));
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
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canCouplePhoto}
            title={
              canCouplePhoto
                ? t("selfie:uploadYourPhotoToAppearTogether")
                : t("selfie:couplePhotosRequireProOrYourOwnFal")
            }
          >
            <Users className="w-4 h-4 mr-1.5" />
            {t("selfie:couplePhotoUploadYourPhotoToAppearTogether")}
            {!canCouplePhoto && (
              <Badge
                variant="secondary"
                className="ml-2 text-[10px] px-1.5 py-0"
              >
                {t("selfie:pro")}
              </Badge>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
