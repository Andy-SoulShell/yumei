/** 引用原文与回复的读写边界，覆盖旧消息和多行内容。 */
import { expect, it } from "vitest";
import { findQuoteSource, formatChatQuote, parseChatQuote } from "./chatQuote";

it("recognizes an existing quote without a blank separator and preserves the reply", () => {
  expect(
    parseChatQuote(
      "> 夏末\n> 好，我在这儿，慢慢说，说完我不会急着给你出主意。\nnihao"
    )
  ).toEqual({
    author: "夏末",
    text: "好，我在这儿，慢慢说，说完我不会急着给你出主意。",
    reply: "nihao",
  });
});

it("round-trips multiline text including blank and literal quote lines", () => {
  const quote = {
    author: "小雨",
    text: "第一行\n\n> 原文里的符号\n最后一行",
    reply: "> 本次回复\n第二行",
  };
  expect(parseChatQuote(formatChatQuote(quote, quote.reply))).toEqual(quote);
});

it.each([
  "普通文字",
  "> 自己写的一行",
  "> 作者\n这不是引用原文",
  "> \n> 引用文字",
  "> 作者\n> \n回复",
])("leaves incomplete or ordinary text untouched: %s", content => {
  expect(parseChatQuote(content)).toBeNull();
});

it("reads CRLF messages and empty replies without leaking delimiters", () => {
  expect(parseChatQuote("> 夏末\r\n> 第一行\r\n> 第二行\r\n\r\n")).toEqual({
    author: "夏末",
    text: "第一行\n第二行",
    reply: "",
  });
});

it("retains a stable message ID after serialization and escapes author delimiters", () => {
  const quote = {
    author: "夏[末]\\",
    text: "原话\n下一行",
    sourceMessageId: 123,
    reply: "回复",
  };
  expect(parseChatQuote(formatChatQuote(quote, quote.reply))).toEqual(quote);
  const edited = formatChatQuote(
    parseChatQuote(formatChatQuote(quote, ""))!,
    "编辑后的回复"
  );
  expect(parseChatQuote(edited)?.sourceMessageId).toBe(123);
});

it.each([0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  "does not store an invalid ID: %s",
  sourceMessageId => {
    expect(
      parseChatQuote(
        formatChatQuote(
          { author: "夏末", text: "原话", sourceMessageId },
          "回复"
        )
      )?.sourceMessageId
    ).toBeUndefined();
  }
);

it("uses the source ID even when several messages have the same text, with no text fallback for missing IDs", () => {
  const messages = [
    { id: 2, content: "相同的话" },
    { id: 4, content: "相同的话" },
    { id: 8, content: "相同的话" },
  ];
  expect(
    findQuoteSource(messages, { text: "相同的话", sourceMessageId: 2 }, 6)
  ).toBe(2);
  expect(
    findQuoteSource(messages, { text: "相同的话", sourceMessageId: 3 }, 6)
  ).toBeUndefined();
  expect(findQuoteSource(messages, { text: "相同的话" }, 6)).toBe(4);
  expect(
    findQuoteSource(messages, { text: "相同的话", sourceMessageId: 8 }, 6)
  ).toBeUndefined();
});

it("can find a legacy quote of a reply without matching its own quoted context", () => {
  const messages = [{ id: 2, content: "> 夏末\n> 旧原话\n\n这次的回复" }];
  expect(findQuoteSource(messages, { text: "这次的回复" }, 5)).toBe(2);
  expect(findQuoteSource(messages, { text: "旧原话" }, 5)).toBeUndefined();
});
