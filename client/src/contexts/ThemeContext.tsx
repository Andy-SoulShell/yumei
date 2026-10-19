/** 应用主题状态、根节点样式类与本地存储同步。 */

import React, { createContext, useContext, useEffect, useState } from "react";

/** 应用支持的浅色与深色主题标识。 */
type Theme = "light" | "dark";

/** 当前主题、可选切换动作与是否允许切换的上下文。 */
interface ThemeContextType {
  theme: Theme;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** 主题容器的初始值与切换行为配置。 */
interface ThemeProviderProps {
  children: React.ReactNode;
  /** 没有可恢复选择时的初始主题，默认 light。 */
  defaultTheme?: Theme;
  /** 是否提供切换并持久化主题，默认 false。 */
  switchable?: boolean;
}

/**
 * 向子组件提供主题，并同步根节点 dark 类。
 *
 * @remarks 允许切换时从 localStorage 恢复并保存选择；当前不校验已存储值。
 */
export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (switchable) {
      const stored = localStorage.getItem("theme");
      return (stored as Theme) || defaultTheme;
    }
    return defaultTheme;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    if (switchable) {
      localStorage.setItem("theme", theme);
    }
  }, [theme, switchable]);

  const toggleTheme = switchable
    ? () => {
        setTheme(prev => (prev === "light" ? "dark" : "light"));
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * 读取最近的应用主题上下文。
 *
 * @throws 在 ThemeProvider 外调用时抛出错误。
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
