/** 首页和探索页共用的角色详情、定制与聊天入口。 */
import type { RefObject } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, Heart, Loader2, Sparkles } from "lucide-react";
import type { CharacterPreset } from "@shared/discovery";
import { useI18n } from "@/lib/i18n";
import { useCompanionChat } from "@/hooks/useCompanionChat";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

/** 显示当前角色，关闭后将键盘焦点交还打开详情的卡片。 */
export function CharacterDetailDialog({
  selected,
  onClose,
  returnFocus,
}: {
  selected?: CharacterPreset;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  const { pending, findPreset, open } = useCompanionChat();
  return (
    <Dialog
      open={!!selected}
      onOpenChange={isOpen => {
        if (!isOpen && pending === null) onClose();
      }}
    >
      <DialogContent
        className="character-detail"
        onCloseAutoFocus={event => {
          if (returnFocus.current?.isConnected) {
            event.preventDefault();
            returnFocus.current.focus();
          }
        }}
      >
        {selected && (
          <>
            <div className="detail-portrait">
              <img src={selected.imageUrl} alt={selected.name} />
              <span className="detail-style">
                <Sparkles size={12} />
                {t(
                  selected.style === "anime"
                    ? "explore:anime"
                    : "explore:realistic"
                )}{" "}
                · AI
              </span>
            </div>
            <div className="detail-content">
              <span className="section-eyebrow">{selected.label}</span>
              <DialogHeader>
                <DialogTitle>
                  {selected.name}
                  <span className="detail-age">
                    {t("explore:age", { age: selected.age })}
                  </span>
                </DialogTitle>
                <DialogDescription>{selected.tagline}</DialogDescription>
              </DialogHeader>
              {!findPreset(selected) && (
                <p className="detail-disclosure">
                  {t("explore:detailDisclosure")}
                </p>
              )}
              <Button
                className="detail-start"
                disabled={pending !== null}
                onClick={() => void open(selected)}
              >
                {pending !== null ? (
                  <Loader2 className="animate-spin" />
                ) : findPreset(selected) ? (
                  <Check />
                ) : (
                  <Heart />
                )}
                {pending !== null
                  ? t("explore:opening")
                  : findPreset(selected)
                    ? t("explore:continueChat")
                    : t("explore:addChat")}
                <ArrowRight />
              </Button>
              <Button variant="ghost" asChild>
                <Link href={"/setup?preset=" + selected.id}>
                  {t("explore:customizeCharacter")}
                </Link>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
