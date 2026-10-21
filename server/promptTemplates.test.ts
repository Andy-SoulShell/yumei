/** 覆盖本次描述优先、空输入兜底和完整文本保留。 */

import { describe, expect, it } from "vitest";
import { SELFIE_POSES } from "./testProductConfig";
import { buildCoupleImagePrompt, buildImagePrompt } from "./testAiConfig";

const request = "海边侧面全身照，穿红色长裙，双手自然下垂，不看镜头，不拿手机";
const appearance = "成年女性，黑色长发，蓝色衬衫";

describe.each(["reference", "text"] as const)(
  "%s image prompts",
  generationMode => {
    it.each(SELFIE_POSES)("gives explicit text priority over $id", pose => {
      const { prompt } = buildImagePrompt({
        userContext: request,
        generationMode,
        appearance,
        pose,
      });
      expect(prompt).toContain(request);
      expect(prompt).not.toContain(pose.promptFragment);
      expect(prompt).not.toMatch(
        /close-up selfie|mirror selfie|direct eye contact|phone held at arm's length/
      );
      expect(prompt).not.toContain("media-context");
    });

    it("keeps multiline input and requirements beyond the old 1000-character cutoff", () => {
      const longRequest =
        "画面细节。".repeat(300) +
        "\n最后的要求：侧面全身，绿色雨伞，黄色长靴。";
      const { prompt } = buildImagePrompt({
        userContext: longRequest,
        generationMode,
        appearance,
      });
      expect(prompt.endsWith(longRequest)).toBe(true);
    });

    it("uses the selected pose only for a blank input", () => {
      const pose = SELFIE_POSES.find(item => item.id === "elegant")!;
      const result = buildImagePrompt({
        userContext: " \n ",
        generationMode,
        appearance,
        pose,
      });
      expect(result.prompt.endsWith(pose.promptFragment)).toBe(true);
      expect(result.mode).toBe("mirror");
      expect(result.prompt).not.toContain("mirror selfie");
    });

    it("can generate without an input or a selected pose", () => {
      const { prompt } = buildImagePrompt({
        userContext: "",
        generationMode,
        appearance,
      });
      expect(prompt).toContain("一张自然的人物照片");
    });
  }
);

it("uses the reference for identity without injecting the saved outfit", () => {
  const { prompt } = buildImagePrompt({
    userContext: request,
    generationMode: "reference",
    appearance,
  });
  expect(prompt).toContain("人物身份");
  expect(prompt).not.toContain(appearance);
});

it("uses the appearance as subordinate context only for text-to-image", () => {
  const { prompt } = buildImagePrompt({
    userContext: request,
    generationMode: "text",
    appearance,
  });
  expect(prompt).toContain(appearance);
  expect(prompt).toContain("冲突时以本次要求为准");
  expect(prompt.endsWith(request)).toBe(true);
});

it("preserves explicit couple requirements and uses a fallback only when blank", () => {
  const request = "两个人在海边，背对镜头，红色外套，远景全身照";
  expect(buildCoupleImagePrompt(request).endsWith(request)).toBe(true);
  expect(buildCoupleImagePrompt(request)).not.toContain("两人自然合照");
  expect(buildCoupleImagePrompt(undefined)).toContain("两人自然合照");
  expect(buildCoupleImagePrompt(" \n ")).toContain("两人自然合照");
});
