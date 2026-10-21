import { renderNotification } from "@shared/notifications";
/** 完整语言包、参数契约、语言匹配与回退行为。 */
import { describe, expect, it } from "vitest";
import { parsePreferences, resolveLocale } from "@shared/preferences";
import { LANGUAGES, LOCALES, normalizeLocale } from "@shared/locales";
import {
  i18n,
  translate,
  type MessageKey,
  type Translator,
} from "@shared/i18n";
import { apiErrorMessage } from "./errors";
import en from "@shared/locales/en";

import { formatPrice, formatRelativeTime } from "./formatters";
import {
  TIER_PRICES,
  productFixture,
  DEFAULT_PREFERENCES,
} from "../../../server/testProductConfig";

const parameters = (text: string) =>
  Array.from(text.matchAll(/\{\{([^}]+)\}\}/g))
    .map(match => match[1])
    .sort();

describe("interface localization", () => {
  it("uses grammatical plurals and localizes structured business failures", () => {
    expect(translate("gallery:photoCount", "en", { count: 1 })).toBe("1 photo");
    expect(translate("gallery:photoCount", "en", { count: 2 })).toBe(
      "2 photos"
    );
    expect(translate("gallery:photoCount", "ko", { count: 1 })).toBe(
      "사진 1장"
    );
    const t = i18n.getFixedT("ja") as Translator;
    const error = {
      message: "LEVEL_LOCKED",
      data: {
        business: {
          reason: "LEVEL_LOCKED",
          requiredLevel: 5,
          currentLevel: 2,
        } as const,
      },
    };
    expect(apiErrorMessage(error, t)).toContain("Lv.5");
    expect(apiErrorMessage(error, t)).toContain("Lv.2");
    expect(apiErrorMessage(error, t)).not.toContain("LEVEL_LOCKED");
    expect(
      apiErrorMessage({ message: "Provider diagnostic <example>" }, t)
    ).toBe("Provider diagnostic <example>");
  });
  it("formats structured prices and relative times in the selected language", () => {
    expect(formatPrice(TIER_PRICES.plus, "en")).toBe("$9.99/month");
    expect(formatPrice(TIER_PRICES.plus, "ja")).toBe("$9.99/月");
    const now = new Date("2026-10-19T12:00:00Z");
    expect(formatRelativeTime("2026-10-19T10:00:00Z", "ja", now)).toMatch(
      /2\s*時間前/
    );
    expect(formatRelativeTime("2026-10-19T10:00:00Z", "ko", now)).toBe(
      "2시간 전"
    );
  });
  it("requires identical keys and interpolation parameters in every published language", () => {
    for (const locale of LOCALES) {
      const catalog = LANGUAGES[locale].messages;
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(en).sort());
      for (const namespace of Object.keys(en) as (keyof typeof en)[]) {
        expect(
          Object.keys(catalog[namespace]).sort(),
          `${locale}:${namespace}`
        ).toEqual(Object.keys(en[namespace]).sort());
        for (const [key, text] of Object.entries(en[namespace])) {
          const target = (catalog[namespace] as Record<string, string>)[key];
          expect(target.trim(), `${locale}:${namespace}:${key}`).not.toBe("");
          expect(parameters(target), `${locale}:${namespace}:${key}`).toEqual(
            parameters(text)
          );
        }
      }
    }
  });
  it("covers domain labels by stable business identifiers", () => {
    expect(
      productFixture.memory.categories.map(item => item.id).sort()
    ).toEqual(["event", "preference", "relationship", "fact"].sort());
  });
  it("matches browser priority, region variants, and explicit choices", () => {
    expect(resolveLocale("system", ["zh-TW", "en-US"])).toBe("zh-CN");
    expect(resolveLocale("system", ["fr-FR", "ja-JP", "en-US"])).toBe("ja");
    expect(resolveLocale("system", ["ko-KR", "ja-JP"])).toBe("ko");
    expect(resolveLocale("ko", ["ja-JP"])).toBe("ko");
    expect(resolveLocale("system", [])).toBe("en");
    expect(normalizeLocale("JA_jp")).toBe("ja");
    expect(normalizeLocale("not-a-language")).toBe("en");
  });
  it("persists all registered languages without losing unrelated preferences", () => {
    expect(parsePreferences(null, productFixture.themes)).toEqual(
      DEFAULT_PREFERENCES
    );
    for (const language of LOCALES)
      expect(
        parsePreferences({ language, theme: "sakura" }, productFixture.themes)
      ).toEqual({
        ...DEFAULT_PREFERENCES,
        language,
        theme: "sakura",
      });
    expect(
      parsePreferences(
        { language: "unsupported", theme: "sakura" },
        productFixture.themes
      )
    ).toEqual({ ...DEFAULT_PREFERENCES, theme: "sakura" });
  });
  it("renders complete sentences without translating or re-interpolating user content", () => {
    const name = "用户原名 <YUMEI> {{count}} $t(common:cancel)";
    expect(translate("chat:empty.start", "ja", { name })).toBe(
      `${name}と話してみましょう`
    );
    expect(translate("chat:empty.start", "ko", { name })).toBe(
      `${name} 님과 대화를 시작해 보세요`
    );
    expect(
      translate("auth:linkSent", "en", { email: "test@example.com" })
    ).toContain("test@example.com");
    expect(
      renderNotification(
        productFixture.proactive,
        { key: "notifications:title.random", values: { name } },
        "ja"
      )
    ).toBe(`${name}: 💬 新着メッセージ`);
  });
  it("falls back to English for an untranslated key without changing another request's language", () => {
    const resource = i18n.getResourceBundle("ja", "common");
    try {
      i18n.removeResourceBundle("ja", "common");
      expect(translate("common:cancel", "ja")).toBe("Cancel");
      expect(translate("common:cancel", "ko")).toBe("취소");
    } finally {
      i18n.addResourceBundle("ja", "common", resource);
    }
  });
});

// 这些错误由 typecheck 验证，避免业务代码传入任意原文或遗漏插值。
function translationTypeContract() {
  // @ts-expect-error 未注册的消息标识
  const unknown: MessageKey = "settings:missingKey";
  void unknown;
  // @ts-expect-error 必须提供 name
  translate("chat:empty.start", "ja");
  // @ts-expect-error 参数名称必须与语言包一致
  translate("chat:empty.start", "ja", { v0: "Yumi" });
}
void translationTypeContract;
