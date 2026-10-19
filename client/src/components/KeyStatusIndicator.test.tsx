/** 验证格式提示不把本地检查或保存状态宣称为真实服务认证。 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KeyStatusIndicator } from "./KeyStatusIndicator";

describe("key status indicator", () => {
  it("labels a plausible key as format-only and pending save", () => {
    const html = renderToStaticMarkup(
      <KeyStatusIndicator name="openrouter" value="sk-or-plausible-key" saved />
    );
    expect(html).toContain("格式通过");
    expect(html).toContain("未验证");
    expect(html).not.toContain("已验证");
  });
  it("labels an existing key as saved without claiming verification", () => {
    expect(
      renderToStaticMarkup(<KeyStatusIndicator name="fal" value="" saved />)
    ).toContain("已保存 · 未验证");
  });
  it("uses the provider format instead of length alone", () => {
    expect(
      renderToStaticMarkup(
        <KeyStatusIndicator name="openrouter" value="long-but-wrong-provider" />
      )
    ).toContain("格式不符");
  });
});
