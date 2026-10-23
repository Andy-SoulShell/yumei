/** 从聊天文字中识别明确的自拍请求，并提取姿势意图。 */

import type { SelfiePose } from "./productConfig";

/**
 * 识别明确的自拍请求，排除常见否定、转述和功能讨论。
 *
 * @returns 匹配到的姿势标识；未请求自拍时返回 null
 * @remarks 使用启发式正则识别，最终额度与姿势权限由服务端校验。
 */
export function detectSelfieRequest(
  content: string,
  poses: readonly SelfiePose[],
  defaultPoseId: string
): { poseId: string } | null {
  const text = content
    .trim()
    .replace(/[“「『"].*?[”」』"]/g, "")
    .replace(/(^|[\s([{])'[^'\n]*'(?=$|[\s)\]}.,!?])/g, "$1");
  if (
    !text ||
    /(?:翻译|解释|分析|讨论|总结|代码|正则|教程|什么意思|怎么实现|如何实现)|翻訳|説明|意味|コード|正規表現|実装|撮り方|作り方|번역|설명|무슨\s*뜻|코드|정규식|구현|만드는\s*방법|찍는\s*방법|\b(?:translate|explain|tutorial|how to|code|regex)\b/i.test(
      text
    )
  )
    return null;
  // 转述、否定和别的拍摄对象不触发计费生成；四种语言使用相同边界。
  if (
    /\b(?:he|she|they|someone|my friend)\s+(?:said|asked|told)\b|(?:他|她|朋友).{0,8}(?:说|說)|(?:彼女|彼|友達).{0,30}(?:言った|言って|頼んだ)|(?:친구|그녀|그가).{0,40}(?:말했|했어|했어요)|(?:라고|달라고).{0,12}(?:말했|했어|했어요)/i.test(
      text
    )
  )
    return null;
  if (
    /(?:自撮り|セルフィー|写真).{0,25}(?:撮らない|送らない|見せない|生成しない|作らない|いらない|不要|ほしくない|欲しくない|見たくない|なくていい|ほしくありません)|(?:セルカ|셀카|셀피|사진).{0,25}(?:찍지\s*마|찍지\s*말|보내지\s*마|보내지\s*말|보여주지\s*마|생성하지\s*마|만들지\s*마|필요\s*없|원하지\s*않|보고\s*싶지\s*않)|(?:안\s*(?:찍|보내|보여)|사진\s*없이)/.test(
      text
    )
  )
    return null;
  if (
    /(?:猫|犬|風景|料理|友達|彼女|彼|私)の写真|(?:고양이|강아지|풍경|음식|친구|다른\s*사람)(?:의)?\s*사진/.test(
      text
    )
  )
    return null;
  if (
    /(?:不要|别|不用|不必|不想|不需要|先不|取消)(?:再|给我|给|你|现在|帮我|为我|生成|发送|发|拍|看|要|一张|张|的|自己|\s)*(?:自拍|照片|拍照|相片)/.test(
      text
    ) ||
    /\b(?:don't|do not|no need to)\s+(?:(?:please|ever|now|again)\s+)*(?:send|take|generate|create|show|make|want|need)\b[^.!?\n]{0,45}\b(?:selfie|photo|picture)\b|\b(?:stop|cancel)\b[^.!?\n]{0,25}\b(?:selfie|photo|picture)\b/i.test(
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
    ) ||
    /(?:自撮り|セルフィー|(?:あなたの)?写真).{0,20}(?:送って|撮って|見せて|生成して|作って|ちょうだい|ください|お願い|見たい|欲しい)|(?:送って|撮って|見せて|生成して|作って).{0,15}(?:自撮り|セルフィー)/.test(
      text
    ) ||
    /(?:셀카|셀피|(?:너의\s*|네\s*)?사진).{0,20}(?:보내|보여|찍어|생성해|만들어|주세요|부탁|보고\s*싶어)/.test(
      text
    );
  if (!requested) return null;
  const searchable = text.toLowerCase();
  const pose = [...poses]
    .reverse()
    .filter(pose => pose.enabled)
    .find(pose =>
      [...pose.aliases, ...Object.values(pose.label)].some(label => {
        if (!label) return false;
        const index = searchable.indexOf(label.toLowerCase());
        if (index < 0) return false;
        const before = text.slice(Math.max(0, index - 30), index);
        const after = text.slice(
          index + label.length,
          index + label.length + 20
        );
        return (
          !/(?:不要|别|不用)\s*$|\b(?:don'?t|do not|no|not)(?:\s+(?:use|the|a|an|be))*\s*$/i.test(
            before
          ) &&
          !/^(?:は)?(?:じゃなく|ではなく|なし)|^(?:은|는)?\s*(?:말고|없이)/.test(
            after
          )
        );
      })
    );
  return { poseId: pose?.id ?? defaultPoseId };
}
