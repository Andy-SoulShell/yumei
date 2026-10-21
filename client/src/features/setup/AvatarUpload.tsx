import { uploadDescription } from "@shared/operationalConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Loader2, Upload, X } from "lucide-react";
import type { SetupController } from "./useSetupController";
type Props = Pick<
  SetupController,
  | "uploads"
  | "t"
  | "avatarInputRef"
  | "displayAvatar"
  | "handleAvatarChange"
  | "avatarFile"
  | "handleUploadAvatar"
  | "isUploadingAvatar"
  | "setAvatarFile"
  | "setAvatarPreview"
  | "existingAvatarUrl"
  | "handleRemoveAvatar"
>;

/** 编辑角色头像，组合预览、文件选择和移除操作。 */
export function AvatarUpload({
  uploads,
  t,
  avatarInputRef,
  displayAvatar,
  handleAvatarChange,
  avatarFile,
  handleUploadAvatar,
  isUploadingAvatar,
  setAvatarFile,
  setAvatarPreview,
  existingAvatarUrl,
  handleRemoveAvatar,
}: Props) {
  return (
    <div className="space-y-2">
      <Label>{t("setup:avatar")}</Label>
      <p className="text-xs text-muted-foreground">
        {t(
          "setup:uploadAnAvatarForTheHomeAndChat",
          uploads
            ? uploadDescription(uploads.avatar)
            : { formats: "", maxMB: 0 }
        )}
      </p>
      <div className="flex items-center gap-4">
        {/* 头像预览 */}
        <Button
          variant="plain"
          size="none"
          type="button"
          aria-label={t("setup:upload")}
          className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-border flex-shrink-0 cursor-pointer group"
          disabled={isUploadingAvatar}
          onClick={() => avatarInputRef.current?.click()}
        >
          {displayAvatar ? (
            <>
              <img
                src={displayAvatar}
                alt={t("setup:avatar2")}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-5 h-5 text-white" />
              </div>
            </>
          ) : (
            <div className="w-full h-full bg-muted flex flex-col items-center justify-center gap-0.5">
              <Camera className="w-5 h-5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">
                {t("setup:upload")}
              </span>
            </div>
          )}
        </Button>

        {/* 操作按钮 */}
        <div className="flex flex-col gap-2">
          <Input
            ref={avatarInputRef}
            type="file"
            accept={uploads?.avatar.mimeTypes.join(",")}
            disabled={!uploads}
            className="hidden"
            onChange={handleAvatarChange}
          />
          {avatarFile ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleUploadAvatar}
                disabled={isUploadingAvatar}
              >
                {isUploadingAvatar ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    {t("setup:uploading")}
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5 mr-1" />
                    {t("setup:confirmUpload")}
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t("common:cancel")}
                disabled={isUploadingAvatar}
                onClick={() => {
                  setAvatarFile(null);
                  setAvatarPreview(null);
                }}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploadingAvatar}
              onClick={() => avatarInputRef.current?.click()}
            >
              <Camera className="w-3.5 h-3.5 mr-1" />
              {displayAvatar ? t("setup:changeAvatar") : t("setup:chooseImage")}
            </Button>
          )}
          {existingAvatarUrl && !avatarFile && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive text-xs"
              disabled={isUploadingAvatar}
              onClick={handleRemoveAvatar}
            >
              <X className="w-3 h-3 mr-1" />
              {t("setup:removeAvatar")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
