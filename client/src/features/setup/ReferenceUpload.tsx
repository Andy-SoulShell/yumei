import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload } from "lucide-react";
import type { SetupController } from "./useSetupController";
type Props = Pick<
  SetupController,
  | "t"
  | "isEditing"
  | "displayImage"
  | "imageInputRef"
  | "handleImageChange"
  | "imageFile"
  | "presetId"
  | "setImageFile"
  | "setImagePreview"
>;

/** 选择参考图并展示上传预览及尺寸要求。 */
export function ReferenceUpload({
  t,
  isEditing,
  displayImage,
  imageInputRef,
  handleImageChange,
  imageFile,
  presetId,
  setImageFile,
  setImagePreview,
}: Props) {
  return (
    <div className="space-y-2">
      <Label htmlFor="image">
        {t("setup:referencePhoto")}
        {!isEditing && "*"}
      </Label>
      <div className="flex flex-col items-center gap-3 sm:gap-4">
        {displayImage ? (
          <>
            <div className="w-36 max-w-full overflow-hidden rounded-lg border-2 border-border bg-muted/30 sm:w-48">
              <img
                src={displayImage}
                alt={t("setup:preview")}
                className="block h-auto max-h-64 w-full object-contain sm:max-h-80"
              />
            </div>
            {!isEditing && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  imageInputRef.current?.click();
                }}
              >
                {t("setup:change")}
              </Button>
            )}
          </>
        ) : (
          <Button
            type="button"
            variant="plain"
            size="none"
            onClick={() => imageInputRef.current?.click()}
            aria-label={t("setup:uploadAReferencePhoto")}
            className="w-48 h-48 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary transition-colors"
          >
            <Upload className="w-12 h-12 text-muted-foreground mb-2" />
            <span className="text-sm text-muted-foreground">
              {t("setup:clickToUploadAPhoto")}
            </span>
            <span className="text-xs text-muted-foreground mt-1">
              {t("setup:jpgPNGGIFOrWebPUpTo10")}
            </span>
          </Button>
        )}
        {!isEditing && (
          <Input
            id="image"
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleImageChange}
          />
        )}
      </div>
      {!isEditing && imageFile && presetId && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setImageFile(null);
            setImagePreview(null);
            if (imageInputRef.current) imageInputRef.current.value = "";
          }}
        >
          {t("setup:restorePresetReference")}
        </Button>
      )}
      {isEditing && (
        <p className="text-xs text-muted-foreground text-center">
          {t("setup:referencePhotosCannotBeChangedWhileEditingCreate")}
        </p>
      )}
    </div>
  );
}
