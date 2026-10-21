import { describe, expect, it } from "vitest";
import {
  resolveSpeechLanguage as resolveSpeechLanguageRaw,
  selectSpeechVoice,
} from "./speech";

describe("speech language", () => {
  it("follows reply settings independently of interface language", () => {
    expect(resolveSpeechLanguageWithDefaults(null)).toBe("zh-CN");
    expect(resolveSpeechLanguageWithDefaults("日本語")).toBe("ja-JP");
    expect(resolveSpeechLanguageWithDefaults("韩语")).toBe("ko-KR");
    expect(resolveSpeechLanguageWithDefaults("English")).toBe("en-US");
  });
  it("prefers an exact language and never selects an unrelated voice", () => {
    const voice = (lang: string) => ({ lang }) as SpeechSynthesisVoice;
    const voices = [
      voice("zh-CN"),
      voice("ja-JP"),
      voice("en-GB"),
      voice("en-US"),
    ];
    expect(selectSpeechVoice(voices, "en-US")).toBe(voices[3]);
    expect(selectSpeechVoice(voices, "ja-JP")).toBe(voices[1]);
    expect(selectSpeechVoice(voices, "ko-KR")).toBeUndefined();
  });
});

function resolveSpeechLanguageWithDefaults(value: string | null | undefined) {
  return resolveSpeechLanguageRaw(value, "zh-CN");
}
