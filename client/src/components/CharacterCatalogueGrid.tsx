/** 首页和探索页共用的公开角色目录，统一卡片资料和图片加载策略。 */
import type { CharacterPreset } from "@shared/discovery";
import { useI18n } from "@/lib/i18n";
import { CharacterCard } from "./CharacterCard";
import { characterTraitKeys } from "@/features/discovery/characterTraits";
import { useCharacterCollection } from "@/features/discovery/CharacterCollection";
import { Button } from "./ui/button";
import { Heart, Loader2 } from "lucide-react";

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
  const collection = useCharacterCollection();
  return (
    <div className="character-grid">
      {characters.map((preset, index) => (
        <div className="studio-character-tile" key={preset.id}>
          <CharacterCard
            name={preset.name}
            age={preset.age}
            image={preset.imageUrl}
            label={preset.label}
            description={preset.tagline}
            traits={characterTraitKeys(preset.behavior)
              .slice(0, 2)
              .map(key => t(key))}
            styleLabel={t(
              preset.style === "anime" ? "explore:anime" : "explore:realistic"
            )}
            onClick={event => onSelect(preset.id, event.currentTarget)}
            priority={index < priorityCount}
          />
          <Button
            className="studio-card-save"
            variant="plain"
            size="icon"
            disabled={collection.busy !== null || collection.loading}
            aria-pressed={collection.ids.includes(preset.id)}
            aria-label={t(
              collection.ids.includes(preset.id)
                ? "studio:removeFavorite"
                : "studio:addFavorite",
              { name: preset.name }
            )}
            onClick={() => collection.toggle(preset.id)}
          >
            {collection.busy === preset.id ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Heart
                fill={
                  collection.ids.includes(preset.id) ? "currentColor" : "none"
                }
              />
            )}
          </Button>
        </div>
      ))}
    </div>
  );
}
