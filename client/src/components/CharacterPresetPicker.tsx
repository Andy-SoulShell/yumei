/** 内置角色预设的画风筛选与受控选择界面。 */

import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { RadioGroup, RadioGroupChoice } from "@/components/ui/radio-group";
import {
  CHARACTER_PRESETS,
  type CharacterPreset,
} from "@shared/characterPresets";

/** 展示内置预设并通过回调返回选择，选择 null 表示从零自定义。 */
export function CharacterPresetPicker({
  selectedId,
  onSelect,
}: {
  /** 当前选中预设标识，null 表示自定义角色。 */
  selectedId: string | null;
  /** 选择预设时返回完整资料；选择从零创建时返回 null。 */
  onSelect: (preset: CharacterPreset | null) => void;
}) {
  const { t } = useI18n();
  const [style, setStyle] = useState<"all" | CharacterPreset["style"]>("all");
  return (
    <section className="space-y-4" aria-label={t("角色预设")}>
      <div>
        <h2 className="font-semibold">{t("从一个角色开始")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "选择后自动填写资料和参考图，你可以继续修改。所有角色均为成年 AI 虚构人物。"
          )}
        </p>
      </div>
      <RadioGroup
        value={style}
        onValueChange={value => setStyle(value as typeof style)}
        className="flex flex-wrap gap-2"
        aria-label={t("角色画风")}
      >
        {(
          [
            ["all", t("全部 8 位")],
            ["realistic", t("写实")],
            ["anime", t("动漫")],
          ] as const
        ).map(([value, label]) => (
          <RadioGroupChoice
            variant="segment"
            key={value}
            value={value}
            className="h-8 px-3 text-sm"
          >
            {label}
          </RadioGroupChoice>
        ))}
      </RadioGroup>
      <RadioGroup
        aria-label={t("角色预设")}
        value={selectedId ?? "custom"}
        onValueChange={id =>
          onSelect(CHARACTER_PRESETS.find(preset => preset.id === id) ?? null)
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {CHARACTER_PRESETS.filter(
            preset => style === "all" || preset.style === style
          ).map(preset => (
            <RadioGroupChoice
              key={preset.id}
              value={preset.id}
              aria-label={t("选择{v0}", { v0: preset.name })}
              className={`relative overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary ${selectedId === preset.id ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/60"}`}
            >
              <img
                src={preset.imageUrl}
                alt={preset.name}
                loading="lazy"
                className="w-full aspect-[3/4] object-cover object-top"
              />
              {selectedId === preset.id && (
                <span className="absolute right-2 top-2 rounded-full bg-primary p-1 text-primary-foreground">
                  <Check className="h-4 w-4" />
                </span>
              )}
              <div className="p-2.5 space-y-1">
                <p className="font-medium">
                  {preset.name}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {preset.age} {t("岁")}
                  </span>
                </p>
                <p className="text-xs text-primary">{t(preset.label)}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t(preset.tagline)}
                </p>
              </div>
            </RadioGroupChoice>
          ))}
        </div>
        <RadioGroupChoice
          variant="segment"
          value="custom"
          className="w-full border-dashed"
        >
          <Pencil className="mr-2 h-4 w-4" />
          {t("从零自定义")}
        </RadioGroupChoice>
      </RadioGroup>
    </section>
  );
}
