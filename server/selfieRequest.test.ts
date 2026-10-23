/** 覆盖明确自拍意图识别及否定、讨论排除。 */

import { describe, expect, it } from "vitest";
import { detectSelfieRequest as detect } from "../shared/selfieRequest";
import { productFixture } from "./testProductConfig";
const detectSelfieRequest = (text: string) =>
  detect(
    text,
    productFixture.selfies.poses,
    productFixture.selfies.defaultPoseId
  );

describe("explicit selfie requests", () => {
  it.each([
    "发张自拍",
    "给我发张自拍吧",
    "生成一张自拍",
    "拍一张你现在的照片",
    "给我看看你的照片",
    "想看看你的自拍",
    "来张近照",
    "自拍来一张",
    "在咖啡馆穿蓝色衬衫，拍张自拍给我",
    "给我拍一张你穿蓝色衬衫的自拍",
    "不要戴帽子，发张自拍",
    "send me a selfie",
    "take a photo of yourself",
  ])("detects a real request: %s", text => {
    expect(detectSelfieRequest(text)).not.toBeNull();
  });
  it.each([
    "你在干嘛",
    "你现在穿什么",
    "今天心情如何",
    "我喜欢自拍",
    "这张照片很好看",
    "不要发自拍",
    "先不要生成一张自拍",
    "不用给我发自拍了",
    "不想看自拍",
    "翻译这句话：发张自拍",
    "解释一下怎么生成自拍",
    "给我生成一张猫的照片",
    "我昨天拍了一张自拍",
    "我想发张自拍给朋友",
    "don't send me a selfie",
    "how to take a selfie",
  ])("does not trigger on chat, negation or meta discussion: %s", text => {
    expect(detectSelfieRequest(text)).toBeNull();
  });
  it("retains requested poses for server-side intimacy checks", () => {
    expect(detectSelfieRequest("发张自拍，要撒娇的样子")).toEqual({
      poseId: "aegyo",
    });
    expect(detectSelfieRequest("发张自拍，要约会夜的风格")).toEqual({
      poseId: "date_night",
    });
    expect(detectSelfieRequest("不要撒娇，发张自拍")).toEqual({
      poseId: "casual",
    });
  });
});

describe("four-language request consistency", () => {
  it.each([
    "自撮りを一枚送って",
    "セルフィーを見せてください",
    "あなたの写真を見たい",
    "写真を送ってもらえる？",
    "気軽な一枚で自撮りを撮って",
    "セルフィーを生成して",
    "셀카 한 장 보내줘",
    "네 사진 보여줘",
    "너의 사진을 보고 싶어",
    "셀피를 생성해 주세요",
    "사진 한 장 찍어줘",
  ])("accepts an explicit Japanese or Korean request: %s", text => {
    expect(detectSelfieRequest(text)).not.toBeNull();
  });
  it.each([
    "自撮りは送らないで",
    "セルフィーはいらない",
    "自撮りを生成しないで",
    "あなたの写真を見たくない",
    "セルフィーの撮り方を説明して",
    "『自撮りを送って』を英語に翻訳して",
    "昨日自撮りを撮った",
    "彼女が自撮りを送ってと言った",
    "猫の写真を送って",
    "셀카 보내지 마",
    "셀카를 찍지 말아 줘",
    "사진은 필요 없어",
    "셀카를 생성하지 마세요",
    "셀카 보내줘를 영어로 번역해줘",
    "셀카 만드는 방법을 설명해줘",
    "어제 셀카 찍었어",
    "친구가 셀카 보내달라고 했어",
    "고양이 사진을 보여줘",
    "she said send me a selfie",
  ])(
    "keeps negation, quotation and meta discussion in ordinary chat: %s",
    text => {
      expect(detectSelfieRequest(text)).toBeNull();
    }
  );
});
it.each([
  "don't use the Playful pose, send me a selfie",
  "甘えん坊じゃなくて、気軽な一枚の自撮りを送って",
  "애교 말고 가볍게 셀카 보내줘",
])("does not select a negated pose in any supported language: %s", text => {
  expect(detectSelfieRequest(text)).toEqual({ poseId: "casual" });
});
it.each([
  "don't wear a hat, send me a selfie",
  "帽子なしで自撮りを送って",
  "모자 없이 셀카 보내줘",
])("keeps appearance constraints distinct from refusing a photo: %s", text => {
  expect(detectSelfieRequest(text)).not.toBeNull();
});
it.each([
  "'send me a selfie'",
  "I don't want you to send a selfie",
  "do not generate a selfie",
])("does not turn a quoted or refused request into generation: %s", text => {
  expect(detectSelfieRequest(text)).toBeNull();
});
