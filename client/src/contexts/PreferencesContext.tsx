import { LANGUAGES } from "@shared/locales";
/** 账号级界面偏好；访客本机保存，登录后读取服务端，连续修改按顺序写入。 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { trpc } from "@/lib/trpc";
import {
  DEFAULT_PREFERENCES,
  parsePreferences,
  resolveLocale,
  type InterfacePreferences,
  type Locale,
} from "@shared/preferences";
import { THEMES } from "@/lib/themes";

type PreferencesContextValue = {
  preferences: InterfacePreferences;
  locale: Locale;
  resolvedMode: "light" | "dark";
  saving: boolean;
  saveError: boolean;
  update: (patch: Partial<InterfacePreferences>) => void;
  retry: () => void;
};
const PreferencesContext = createContext<PreferencesContextValue | null>(null);
const storageKey = (userId: string | null) =>
  `yumei:interface:${userId ?? "guest"}`;

/** 浏览器禁止存储或数据损坏时仍可使用默认偏好。 */
function readLocal(userId: string | null) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) return parsePreferences(JSON.parse(raw));
    // 迁移旧版仅保存在本机的亮暗选择，不将其他账号的缓存用作默认值。
    const legacyMode = !userId ? localStorage.getItem("theme") : null;
    return parsePreferences({ colorMode: legacyMode });
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}
/** 缓存按账号隔离，持久化受限时保留当前会话中的选择。 */
function writeLocal(userId: string | null, value: InterfacePreferences) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(value));
  } catch {
    /* 隐私模式仅应用于本次会话。 */
  }
}

/** 同步系统显示模式、账号偏好、文档语言和语义主题色。 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const me = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const userId = me.data?.id ?? null;
  const remote = trpc.preferences.get.useQuery(undefined, {
    enabled: !!userId,
    retry: false,
  });
  const mutation = trpc.preferences.update.useMutation();
  const utils = trpc.useUtils();
  const [state, setState] = useState(() => ({
    userId: null as string | null,
    value: readLocal(null),
  }));
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
  );
  const [languages, setLanguages] = useState(() => [...navigator.languages]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const current = useRef(state);
  const edits = useRef<Partial<InterfacePreferences>>({});
  const hydrated = useRef<string | null>(null);
  const chain = useRef(Promise.resolve());
  const revision = useRef(0);
  const pending = useRef(0);
  const unsaved = useRef<Partial<InterfacePreferences>>({});
  const value = state.userId === userId ? state.value : readLocal(userId);

  useEffect(() => {
    if (current.current.userId === userId) return;
    current.current = { userId, value: readLocal(userId) };
    edits.current = {};
    unsaved.current = {};
    hydrated.current = null;
    pending.current = 0;
    chain.current = Promise.resolve();
    revision.current++;
    setSaving(false);
    setSaveError(false);
    setState(current.current);
  }, [userId]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onMode = () => setSystemDark(media?.matches ?? false);
    const onLanguage = () => setLanguages([...navigator.languages]);
    media?.addEventListener("change", onMode);
    window.addEventListener("languagechange", onLanguage);
    return () => {
      media?.removeEventListener("change", onMode);
      window.removeEventListener("languagechange", onLanguage);
    };
  }, []);

  const persist = useCallback(
    (patch: Partial<InterfacePreferences>) => {
      const owner = userId;
      const epoch = revision.current;
      if (!owner) return;
      unsaved.current = { ...unsaved.current, ...patch };
      pending.current++;
      setSaving(true);
      chain.current = chain.current
        .catch(() => {})
        .then(async () => {
          if (current.current.userId !== owner || revision.current !== epoch)
            return;
          try {
            const saved = await mutation.mutateAsync(patch);
            if (current.current.userId !== owner || revision.current !== epoch)
              return;
            utils.preferences.get.setData(undefined, saved);
            for (const key of Object.keys(
              patch
            ) as (keyof InterfacePreferences)[]) {
              if (unsaved.current[key] === patch[key])
                delete unsaved.current[key];
            }
            setSaveError(Object.keys(unsaved.current).length > 0);
          } catch {
            if (current.current.userId === owner && revision.current === epoch)
              setSaveError(true);
          } finally {
            if (
              current.current.userId === owner &&
              revision.current === epoch
            ) {
              pending.current--;
              setSaving(pending.current > 0);
            }
          }
        });
    },
    [mutation, userId, utils]
  );

  useEffect(() => {
    if (
      !userId ||
      remote.data?.userId !== userId ||
      hydrated.current === userId
    )
      return;
    hydrated.current = userId;
    const base = remote.data.initialized ? remote.data : readLocal(null);
    const next = parsePreferences({ ...base, ...edits.current });
    current.current = { userId, value: next };
    setState(current.current);
    writeLocal(userId, next);
    if (!remote.data.initialized) persist(next);
  }, [remote.data, userId, persist]);

  const update = useCallback(
    (patch: Partial<InterfacePreferences>) => {
      const base =
        current.current.userId === userId
          ? current.current.value
          : readLocal(userId);
      const next = parsePreferences({ ...base, ...patch });
      edits.current = { ...edits.current, ...patch };
      current.current = { userId, value: next };
      setState(current.current);
      writeLocal(userId, next);
      persist(patch);
    },
    [persist, userId]
  );

  const locale = resolveLocale(value.language, languages);
  const resolvedMode =
    value.colorMode === "system"
      ? systemDark
        ? "dark"
        : "light"
      : value.colorMode;
  useEffect(() => {
    const root = document.documentElement;
    const palette = THEMES[value.theme];
    root.lang = locale;
    const language = LANGUAGES[locale];
    root.style.setProperty("--locale-font", language.fontFamily);
    root.style.setProperty("--locale-word-break", language.wordBreak);
    let font = document.querySelector<HTMLLinkElement>("#locale-font");
    if (language.fontStylesheet) {
      if (!font) {
        font = document.createElement("link");
        font.id = "locale-font";
        font.rel = "stylesheet";
        document.head.append(font);
      }
      font.href = language.fontStylesheet;
    } else font?.remove();
    root.dataset.theme = value.theme;
    root.classList.toggle("dark", resolvedMode === "dark");
    root.style.colorScheme = resolvedMode;
    root.style.setProperty("--theme-hue", String(palette.hue));
    root.style.setProperty("--theme-primary", palette[resolvedMode]);
    root.style.setProperty(
      "--theme-background",
      palette.background[resolvedMode]
    );
    root.style.setProperty(
      "--theme-primary-foreground",
      resolvedMode === "dark" ? palette.foreground : "#ffffff"
    );
    root.style.setProperty("--theme-secondary", palette.colors[1]);
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach(meta => {
        meta.content = palette.background[resolvedMode];
        meta.removeAttribute("media");
      });
  }, [locale, resolvedMode, value.theme]);

  return (
    <PreferencesContext.Provider
      value={{
        preferences: value,
        locale,
        resolvedMode,
        saving,
        saveError: saveError || (!!userId && remote.isError),
        update,
        retry: () => {
          if (remote.isError) void remote.refetch();
          if (Object.keys(unsaved.current).length) persist(unsaved.current);
        },
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

/** 读取界面偏好；独立渲染的提示组件在容器外使用中文默认值。 */
export function usePreferences(): PreferencesContextValue {
  return (
    useContext(PreferencesContext) ?? {
      preferences: DEFAULT_PREFERENCES,
      locale: "zh-CN",
      resolvedMode: "light",
      saving: false,
      saveError: false,
      update: () => {},
      retry: () => {},
    }
  );
}
