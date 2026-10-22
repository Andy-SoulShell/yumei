/** 引用原文与回复的读写边界，覆盖旧消息和多行内容。 */
import { expect, it } from "vitest";
import { formatChatQuote, parseChatQuote } from "./chatQuote";

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
