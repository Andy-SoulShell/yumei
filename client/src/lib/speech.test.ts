import { describe, expect, it } from "vitest";
import { resolveSpeechLanguage, selectSpeechVoice } from "./speech";

describe("speech language", () => {
  it("follows reply settings independently of interface language", () => {
    expect(resolveSpeechLanguage(null)).toBe("zh-CN");
    expect(resolveSpeechLanguage("日本語")).toBe("ja-JP");
    expect(resolveSpeechLanguage("韩语")).toBe("ko-KR");
    expect(resolveSpeechLanguage("English")).toBe("en-US");
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
