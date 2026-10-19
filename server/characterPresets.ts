/** 从开发或生产公共资源目录读取受信任的内置角色参考图。 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCharacterPreset } from "../shared/characterPresets";
import { DEFAULT_GIRLFRIEND } from "../shared/defaultGirlfriend";

/** 按预设编号读取对应 JPEG 参考图，未知预设时抛出错误。 */
export async function readPresetReference(presetId: string): Promise<Buffer> {
  const preset = getCharacterPreset(presetId);
  if (!preset) throw new Error("角色预设不存在");
  return readBundledReference(preset.imageUrl);
}

/** 读取默认 YUMEI 角色的内置参考图字节。 */
export async function readDefaultReference(): Promise<Buffer> {
  return readBundledReference(DEFAULT_GIRLFRIEND.referenceImageUrl);
}

/**
 * 根据运行模式选择公共资源目录，再读取内部定义的资源路径。
 *
 * @remarks imageUrl 应来自内置配置，不能直接传入用户提供的文件路径。
 */
function readBundledReference(imageUrl: string): Promise<Buffer> {
  const publicDir =
    process.env.NODE_ENV === "production" ? "dist/public" : "client/public";
  return readFile(path.resolve(process.cwd(), publicDir, imageUrl.slice(1)));
}
