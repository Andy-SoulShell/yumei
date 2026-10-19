/** 为导航栏和提示容器提供统一的实际显示模式及切换动作。 */
import { usePreferences } from "./PreferencesContext";

export function useTheme() {
  const { resolvedMode, update } = usePreferences();
  return {
    theme: resolvedMode,
    switchable: true,
    toggleTheme: () =>
      update({ colorMode: resolvedMode === "dark" ? "light" : "dark" }),
  };
}
