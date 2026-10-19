import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCharacterPreset } from "../shared/characterPresets";

export async function readPresetReference(presetId: string): Promise<Buffer> {
  const preset = getCharacterPreset(presetId);
  if (!preset) throw new Error("角色预设不存在");
  const publicDir =
    process.env.NODE_ENV === "production" ? "dist/public" : "client/public";
  return readFile(
    path.resolve(process.cwd(), publicDir, preset.imageUrl.slice(1))
  );
}
