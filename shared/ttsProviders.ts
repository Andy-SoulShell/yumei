/** 用户可选择的朗读服务；本地 OmniVoice 由运营方单独启用。 */
export const TTS_PROVIDERS = [
  "browser",
  "elevenlabs",
  "fishaudio",
  "omnivoice",
] as const;
export type TTSProvider = (typeof TTS_PROVIDERS)[number];
