import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCharacterPreset } from "../shared/characterPresets";
import { DEFAULT_GIRLFRIEND } from "../shared/defaultGirlfriend";

export async function readPresetReference(presetId: string): Promise<Buffer> {
  const preset = getCharacterPreset(presetId);
  if (!preset) throw new Error("角色预设不存在");
  return readBundledReference(preset.imageUrl);
}

export async function readDefaultReference(): Promise<Buffer> {
  return readBundledReference(DEFAULT_GIRLFRIEND.referenceImageUrl);
}

function readBundledReference(imageUrl: string): Promise<Buffer> {
  const publicDir =
    process.env.NODE_ENV === "production" ? "dist/public" : "client/public";
  return readFile(path.resolve(process.cwd(), publicDir, imageUrl.slice(1)));
}
