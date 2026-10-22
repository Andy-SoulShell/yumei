/** 空会话中的开场引导；选择后交给输入区编辑和发送。 */
import { Button } from "@/components/ui/button";
import type { Translator } from "@shared/i18n";
import { Heart, MessageCircle, Sparkles } from "lucide-react";

type Props = {
  name: string;
  t: Translator;
  disabled: boolean;
  onSelect: (text: string) => void;
};

/** 展示三种轻量开场，窄屏纵向排列并保留完整触控区域。 */
export function ChatStarters({ name, t, disabled, onSelect }: Props) {
  const topics = [
    {
      icon: MessageCircle,
      label: t("chat:starterDay"),
      text: t("chat:starterDayDraft", { name }),
    },
    {
      icon: Heart,
      label: t("chat:starterComfort"),
      text: t("chat:starterComfortDraft", { name }),
    },
    {
      icon: Sparkles,
      label: t("chat:starterDiscover"),
      text: t("chat:starterDiscoverDraft", { name }),
    },
  ];
  return (
    <div
      className="chat-starters"
      role="group"
      aria-label={t("chat:starterTopics")}
    >
      {topics.map(({ icon: Icon, label, text }) => (
        <Button
          key={label}
          type="button"
          variant="outline"
          className="chat-starter"
          disabled={disabled}
          onClick={() => onSelect(text)}
        >
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </Button>
      ))}
      <p className="text-xs text-muted-foreground">
        {t("chat:draftSuggestionHint")}
      </p>
    </div>
  );
}
