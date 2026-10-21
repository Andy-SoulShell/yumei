/** 首页和探索页共用的公开角色目录，统一卡片资料和图片加载策略。 */
import type { CharacterPreset } from "@shared/discovery";
import { useI18n } from "@/lib/i18n";
import { CharacterCard } from "./CharacterCard";

/** 展示指定顺序的角色，并将选择交给所在页面处理。 */
export function CharacterCatalogueGrid({
  characters,
  onSelect,
  priorityCount = 0,
}: {
  characters: readonly CharacterPreset[];
  onSelect: (id: string, trigger?: HTMLElement) => void;
  priorityCount?: number;
}) {
  const { t } = useI18n();
  return (
    <div className="character-grid">
      {characters.map((preset, index) => (
        <CharacterCard
          key={preset.id}
          name={preset.name}
          age={preset.age}
          image={preset.imageUrl}
          label={preset.label}
          description={preset.tagline}
          styleLabel={t(
            preset.style === "anime" ? "explore:anime" : "explore:realistic"
          )}
          onClick={event => onSelect(preset.id, event.currentTarget)}
          priority={index < priorityCount}
        />
      ))}
    </div>
  );
}
