/** 参考音频上传表单和已认证 API 共用的大小、数量及音色标识约束。 */
export const OMNIVOICE_REFERENCE_MAX_BYTES = 5 * 1024 * 1024;
export const OMNIVOICE_REFERENCE_MAX_BASE64 =
  Math.ceil(OMNIVOICE_REFERENCE_MAX_BYTES / 3) * 4;
export const OMNIVOICE_CLONE_LIMIT = 10;
export const OMNIVOICE_CLONE_PREFIX = "clone_";
export type OmniVoiceReference = { audio: string; text: string };
