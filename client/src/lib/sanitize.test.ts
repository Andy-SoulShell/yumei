// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { sanitizeForMarkdown } from "./sanitize";

/**
 * Tests for issue #9: stored XSS via LLM-emitted HTML in chat messages.
 *
 * `dompurify` requires a DOM. The vitest config defaults to a node
 * environment for server tests; this file opts into jsdom via the
 * `@vitest-environment jsdom` directive above.
 */

describe("sanitizeForMarkdown (issue #9)", () => {
  it("preserves plain text and markdown syntax verbatim", () => {
    expect(sanitizeForMarkdown("**bold**")).toBe("**bold**");
    expect(sanitizeForMarkdown("# heading")).toBe("# heading");
    expect(sanitizeForMarkdown("[link](https://example.com)")).toBe(
      "[link](https://example.com)"
    );
    expect(
      sanitizeForMarkdown("inline `code` and ```\ncode block\n```")
    ).toBe("inline `code` and ```\ncode block\n```");
  });

  it("strips raw <script> tags entirely", () => {
    const out = sanitizeForMarkdown("hi <script>alert(1)</script> there");
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("hi");
    expect(out).toContain("there");
  });

  it("strips <img onerror=...> attack", () => {
    const out = sanitizeForMarkdown(
      `Look: <img src=x onerror="alert(document.cookie)">`
    );
    expect(out).not.toContain("<img");
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("alert");
  });

  it("strips <iframe> embedding", () => {
    const out = sanitizeForMarkdown(
      `<iframe src="https://evil.example/"></iframe>welcome`
    );
    expect(out).not.toContain("<iframe");
    expect(out).toContain("welcome");
  });

  it("strips <a href='javascript:...'> tags", () => {
    const out = sanitizeForMarkdown(
      `<a href="javascript:alert(1)">click</a>`
    );
    expect(out).not.toContain("<a ");
    expect(out).not.toContain("javascript:");
    // KEEP_CONTENT=true preserves the visible text "click"
    expect(out).toContain("click");
  });

  it("strips event handlers from any tag", () => {
    const out = sanitizeForMarkdown(
      `<div onmouseover="alert(1)">hover me</div>`
    );
    expect(out).not.toContain("onmouseover");
    expect(out).not.toContain("alert");
    expect(out).toContain("hover me");
  });

  it("handles mixed markdown and HTML correctly", () => {
    const out = sanitizeForMarkdown(
      "Hello **friend**, click <a href='evil'>here</a> for details"
    );
    expect(out).toContain("**friend**"); // markdown survives
    expect(out).toContain("here"); // text content of <a> survives
    expect(out).not.toContain("<a "); // tag removed
    expect(out).not.toContain("evil"); // href value gone
  });

  it("returns empty string on empty / null input", () => {
    expect(sanitizeForMarkdown("")).toBe("");
    expect(sanitizeForMarkdown(null as any)).toBe("");
    expect(sanitizeForMarkdown(undefined as any)).toBe("");
  });

  it("does not double-escape HTML entities", () => {
    // Important: sanitization shouldn't turn `&amp;` into `&amp;amp;`
    // on subsequent passes.
    const once = sanitizeForMarkdown("price &amp; tax");
    const twice = sanitizeForMarkdown(once);
    expect(twice).toBe(once);
  });
});
