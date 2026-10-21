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
