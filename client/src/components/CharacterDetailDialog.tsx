/** 首页和探索页共用的角色详情、定制与聊天入口。 */
import type { ReactNode, RefObject } from "react";
import { Sparkles } from "lucide-react";
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
        <section className="detail-section" aria-label={t("explore:chatStyle")}>
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
        {example && (
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
        )}
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
          <CharacterDetailContent selected={selected}>
            <CharacterChatActions selected={selected} chat={chat} />
          </CharacterDetailContent>
        )}
      </DialogContent>
    </Dialog>
  );
}
