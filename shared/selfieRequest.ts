import { SELFIE_POSES } from "./selfiePoses";

/** Only an explicit request for a companion photo triggers generation. */
export function detectSelfieRequest(
  content: string
): { poseId: string } | null {
  const text = content.trim();
  if (
    !text ||
    /(?:翻译|解释|分析|讨论|总结|代码|正则|教程|什么意思|怎么实现|如何实现)|\b(?:translate|explain|tutorial|how to|code|regex)\b/i.test(
      text
    )
  )
    return null;
  if (
    /(?:不要|别|不用|不必|不想|不需要|先不|取消)(?:再|给我|给|你|现在|帮我|为我|生成|发送|发|拍|看|要|一张|张|的|自己|\s)*(?:自拍|照片|拍照|相片)/.test(
      text
    ) ||
    /\b(?:don't|do not|stop|cancel|no need to)[^.!?\n]{0,30}\b(?:selfie|photo|picture)\b/i.test(
      text
    )
  )
    return null;
  if (
    /(?:^|[，,。！？!?\n])\s*(?:我|她|他)(?:也|想|会|要|刚才|准备|已经|昨天|曾经|之前|上次|正在|打算|决定)?(?:发|拍|生成)(?:了|过|一|张|个)/.test(
      text
    )
  )
    return null;
  const requested =
    /(?:发(?:送)?|来|生成|拍|给我看(?:看)?|想看(?:看)?|给我|传)(?:一下|给我|帮我|为我|一|两|张|个|下|你|的|自己|现在|今天|刚才|最近|一些|自然|清晰|近距离|\s){0,16}(?:自拍(?:照)?|近照|照片|相片)/.test(
      text
    ) ||
    /(?:^|[，,。！？!?\n]|请|帮我|给我|能不能|可以|让你)(?:帮我|给我)?(?:发|拍|来|生成)(?:一|两)?张[^。！？\n]{0,100}(?:自拍|你(?:的|现在的)(?:照片|相片))/.test(
      text
    ) ||
    /(?:自拍|近照)(?:照)?(?:给我(?:看)?|来一张|拍一张|发一张|发给我)/.test(
      text
    ) ||
    /\b(?:send|take|generate|create|show)\b[^.!?\n]{0,45}\b(?:selfie|(?:photo|picture)\s+of\s+(?:you|yourself))\b/i.test(
      text
    );
  if (!requested) return null;
  const pose = [...SELFIE_POSES]
    .reverse()
    .find(
      pose =>
        text.includes(pose.label) &&
        !new RegExp(`(?:不要|别|不用)\\s*${pose.label}`).test(text)
    );
  return { poseId: pose?.id || "casual" };
}
