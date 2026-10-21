/** 主题色卡、名称和说明的统一展示，供侧栏与设置页共用。 */
import type { ThemeId } from "@shared/preferences";
import { usePreferences } from "@/contexts/PreferencesContext";
import { cn } from "@/lib/utils";

/** 卡片与紧凑菜单共用色卡和文案；当前选中值仅展示色卡和名称。 */
export function ThemeOption({
  theme,
  variant = "card",
}: {
  theme: ThemeId;
  variant?: "card" | "menu" | "value";
}) {
  const { themes } = usePreferences();
  const palette = themes.find(item => item.id === theme);
  if (!palette) return null;
  const compact = variant === "value";
  const menu = variant === "menu";
  return (
    <span
      className={cn(
        "theme-option flex min-w-0 flex-1 items-center",
        compact ? "gap-1.5" : menu ? "gap-2" : "gap-3"
      )}
    >
      <span
        className={cn(
          "theme-option-colors flex shrink-0",
          compact || menu ? "-space-x-1" : "-space-x-1.5"
        )}
        aria-hidden="true"
      >
        {palette.colors.map(color => (
          <span
            key={color}
            style={{ backgroundColor: color }}
            className={cn(
              "rounded-full border border-black/10",
              compact
                ? "h-2.5 w-2.5"
                : menu
                  ? "h-3.5 w-3.5"
                  : "h-4 w-4 sm:h-5 sm:w-5"
            )}
          />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "theme-option-name block",
            compact
              ? "truncate"
              : menu
                ? "text-[13px] font-medium leading-4"
                : "text-sm font-semibold"
          )}
        >
          {palette.name}
        </span>
        {!compact && (
          <span
            className={cn(
              "theme-option-description block text-muted-foreground",
              menu ? "mt-0.5 text-[11px] leading-4" : "mt-1 text-xs"
            )}
          >
            {palette.description}
          </span>
        )}
      </span>
    </span>
  );
}
