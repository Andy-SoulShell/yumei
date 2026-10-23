/** 首页和探索页共用的角色详情、定制与聊天入口。 */
import { useState, type ReactNode, type RefObject } from "react";
import { Heart, Share2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { useCharacterCollection } from "@/features/discovery/CharacterCollection";
import type { CharacterPreset } from "@shared/discovery";
import { useI18n } from "@/lib/i18n";
import { useCompanionChat } from "@/hooks/useCompanionChat";
import { characterTraitKeys } from "@/features/discovery/characterTraits";
import { CharacterChatActions } from "@/features/discovery/CharacterChatActions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

/** 前台详情和后台草稿预览共用展示部分，预览不会触发角色创建。 */
export function CharacterDetailContent({
  selected,
  children,
}: {
  selected: CharacterPreset;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const example = selected.behavior.examples[0];
  const collection = useCharacterCollection();
  const [tab, setTab] = useState<"profile" | "scenario" | "photos">("profile");
  const [shareUrl, setShareUrl] = useState("");
  const share = async () => {
    const url = new URL("/explore", window.location.origin);
    url.searchParams.set("character", selected.id);
    try {
      if (navigator.share)
        await navigator.share({ title: selected.name, url: url.href });
      else {
        await navigator.clipboard.writeText(url.href);
        toast.success(t("studio:copied"));
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setShareUrl(url.href);
    }
  };
  return (
    <>
      <div className="detail-portrait">
        <img src={selected.imageUrl} alt={selected.name} />
        <span className="detail-style">
          <Sparkles size={12} />
          {t(
            selected.style === "anime" ? "explore:anime" : "explore:realistic"
          )}{" "}
          · AI
        </span>
      </div>
      <div
        className="detail-content"
        tabIndex={0}
        role="region"
        aria-label={selected.name}
      >
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
        <div className="studio-detail-tools">
          <Button
            variant="outline"
            disabled={collection.busy !== null || collection.loading}
            aria-pressed={collection.ids.includes(selected.id)}
            onClick={() => collection.toggle(selected.id)}
          >
            <Heart
              fill={
                collection.ids.includes(selected.id) ? "currentColor" : "none"
              }
            />
            {t("studio:myFavorites")}
          </Button>
          <Button variant="outline" onClick={() => void share()}>
            <Share2 />
            {t("studio:share")}
          </Button>
        </div>
        {shareUrl && (
          <label className="space-y-2 text-xs">
            <span>{t("studio:copyFailed")}</span>
            <input
              readOnly
              value={shareUrl}
              onFocus={event => event.target.select()}
              className="min-h-11 w-full rounded-lg border px-3"
            />
          </label>
        )}
        <div
          className="studio-detail-tabs"
          role="tablist"
          aria-label={t("studio:profile")}
        >
          {(["profile", "scenario", "photos"] as const).map((value, index) => (
            <Button
              key={value}
              id={`character-${selected.id}-${value}-tab`}
              aria-controls={`character-${selected.id}-panel`}
              role="tab"
              aria-selected={tab === value}
              tabIndex={tab === value ? 0 : -1}
              variant="ghost"
              onClick={() => setTab(value)}
              onKeyDown={event => {
                const values = ["profile", "scenario", "photos"] as const;
                const target =
                  event.key === "ArrowRight"
                    ? values[(index + 1) % 3]
                    : event.key === "ArrowLeft"
                      ? values[(index + 2) % 3]
                      : event.key === "Home"
                        ? values[0]
                        : event.key === "End"
                          ? values[2]
                          : null;
                if (target) {
                  event.preventDefault();
                  setTab(target);
                  document
                    .getElementById(`character-${selected.id}-${target}-tab`)
                    ?.focus();
                }
              }}
            >
              {t(`studio:${value}`)}
            </Button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`character-${selected.id}-panel`}
          aria-labelledby={`character-${selected.id}-${tab}-tab`}
          className="space-y-5"
          tabIndex={0}
        >
          {tab === "profile" && (
            <>
              <section
                className="detail-section"
                aria-label={t("explore:chatStyle")}
              >
                <h3>{t("explore:chatStyle")}</h3>
                <div className="detail-traits">
                  {characterTraitKeys(selected.behavior).map(key => (
                    <span key={key}>{t(key)}</span>
                  ))}
                </div>
              </section>
              <section className="detail-section">
                <h3>{t("explore:aboutCharacter", { name: selected.name })}</h3>
                <p className="detail-personality">{selected.personality}</p>
                {selected.interests.trim() && (
                  <p className="detail-interests">
                    <span>{t("explore:interestsLabel")}</span>
                    {selected.interests}
                  </p>
                )}
              </section>
            </>
          )}
          {tab === "scenario" &&
            (example ? (
              <section className="detail-section detail-example">
                <h3>{t("explore:conversationPreview")}</h3>
                <p className="detail-example-hint">
                  {t("explore:conversationPreviewHint")}
                </p>
                <div className="detail-example-user">
                  <span>{t("setup:behaviorExampleUser")}</span>
                  <p>{example.user}</p>
                </div>
                <div className="detail-example-assistant">
                  <span>{selected.name}</span>
                  <p>{example.assistant}</p>
                </div>
              </section>
            ) : (
              <p className="detail-example-hint">
                {t("explore:conversationPreviewHint")}
              </p>
            ))}
          {tab === "photos" && (
            <img
              src={selected.imageUrl}
              alt={selected.name}
              className="w-full rounded-xl"
            />
          )}
        </div>
      </div>
      <div className="detail-actions">{children}</div>
    </>
  );
}

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
  const chat = useCompanionChat();
  return (
    <Dialog
      open={!!selected}
      onOpenChange={isOpen => {
        if (!isOpen && chat.pending === null) onClose();
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
          <CharacterDetailContent key={selected.id} selected={selected}>
            <CharacterChatActions selected={selected} chat={chat} />
          </CharacterDetailContent>
        )}
      </DialogContent>
    </Dialog>
  );
}
