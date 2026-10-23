/** 探索页使用的图片角色卡，展示真实角色信息并打开详情。 */
import { ArrowUpRight, Sparkles } from "lucide-react";
import { useId, type MouseEventHandler } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "./ui/button";

/** 可复用的竖版角色卡；整张卡片为一个可键盘访问的操作入口。 */
export function CharacterCard({
  name,
  image,
  label,
  description,
  age,
  styleLabel,
  onClick,
  priority = false,
  traits,
}: {
  name: string;
  image: string;
  label: string;
  description: string;
  age?: number;
  styleLabel?: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  priority?: boolean;
  traits?: readonly string[];
}) {
  const { t } = useI18n();
  const descriptionId = useId();
  return (
    <Button
      variant="plain"
      size="none"
      type="button"
      className={`character-card group${traits ? " character-card-profile" : ""}`}
      onClick={onClick}
      aria-label={t("explore:viewCharacter", { name })}
      aria-describedby={traits ? descriptionId : undefined}
    >
      <span className="character-card-portrait">
        <img
          src={image}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="character-card-image"
        />
        <span className="character-card-shade" />
        <span className="character-card-top">
          <span className="character-style">
            {styleLabel || t("explore:custom")}
          </span>
          <span className="character-ai">
            <Sparkles size={10} />
            AI
          </span>
        </span>
      </span>
      <span className="character-card-content" id={descriptionId}>
        <span className="character-name">
          {name}
          {age && <span>{t("explore:age", { age })}</span>}
          <ArrowUpRight size={17} />
        </span>
        <span className="character-label">{label}</span>
        <span className="character-description">{description}</span>
        {traits && (
          <span className="character-traits">
            {traits.map(trait => (
              <span key={trait}>{trait}</span>
            ))}
          </span>
        )}
      </span>
    </Button>
  );
}
