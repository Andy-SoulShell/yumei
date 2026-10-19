import { useRef, useState } from "react";
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
 * 拍照选择器：姿势随亲密度解锁，合照为 Pro/BYOK 专属。
 * 锁定项保持可见 —— 「还差 X 级解锁」本身就是养成动力。
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intimacyLevel: number;
  canCouplePhoto: boolean;
  supportsTextToImage?: boolean;
  onSelectPose: (poseId: string, generationMode: "reference" | "text") => void;
  onCouplePhoto: (file: File) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [generationMode, setGenerationMode] = useState<"reference" | "text">(
    "reference"
  );
  const selectedMode = supportsTextToImage ? generationMode : "reference";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>让她拍一张…</DialogTitle>
          <DialogDescription>
            姿势随亲密度解锁。输入框里的文字会作为场景描述一起生效。
          </DialogDescription>
        </DialogHeader>

        {supportsTextToImage && (
          <div className="space-y-2">
            <div
              className="grid grid-cols-2 gap-2"
              role="group"
              aria-label="生图方式"
            >
              <Button
                type="button"
                variant={selectedMode === "reference" ? "default" : "outline"}
                aria-pressed={selectedMode === "reference"}
                onClick={() => setGenerationMode("reference")}
              >
                参考图生图
              </Button>
              <Button
                type="button"
                variant={selectedMode === "text" ? "default" : "outline"}
                aria-pressed={selectedMode === "text"}
                onClick={() => setGenerationMode("text")}
              >
                文生图
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              默认生成 9:16 竖屏照片。
              {selectedMode === "reference"
                ? "使用角色参考图，尽量保持人物外貌一致。"
                : "根据角色外貌与输入框中的场景描述生成，不使用参考图。"}
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {SELFIE_POSES.map(pose => {
            const locked = pose.minLevel > intimacyLevel;
            return (
              <button
                key={pose.id}
                type="button"
                disabled={locked}
                title={locked ? `亲密度 Lv.${pose.minLevel} 解锁` : pose.label}
                className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors ${
                  locked
                    ? "opacity-45 cursor-not-allowed bg-muted/40"
                    : "hover:border-primary hover:bg-primary/5"
                }`}
                onClick={() => {
                  onSelectPose(pose.id, selectedMode);
                  onOpenChange(false);
                }}
              >
                <span className="text-2xl leading-none">{pose.emoji}</span>
                <span className="truncate w-full text-center">
                  {pose.label}
                </span>
                {locked ? (
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 gap-0.5"
                  >
                    <Lock className="w-2.5 h-2.5" />
                    Lv.{pose.minLevel}
                  </Badge>
                ) : (
                  <span className="text-[10px] text-transparent select-none">
                    ·
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="border-t pt-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) {
                onCouplePhoto(file);
                onOpenChange(false);
              }
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canCouplePhoto}
            title={
              canCouplePhoto
                ? "上传你的照片，和她同框"
                : "合照是 Pro 功能（或配置自己的 fal.ai Key）"
            }
          >
            <Users className="w-4 h-4 mr-1.5" />
            合照：上传你的照片，和她同框
            {!canCouplePhoto && (
              <Badge
                variant="secondary"
                className="ml-2 text-[10px] px-1.5 py-0"
              >
                Pro
              </Badge>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
