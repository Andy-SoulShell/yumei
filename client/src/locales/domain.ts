/** 界面文案按稳定业务 ID 关联；不修改角色资料和聊天内容。 */
import type { StaticMessageKey } from "@shared/i18n";
export const intimacyMessages: Record<
  number,
  {
    name: StaticMessageKey;
    description: StaticMessageKey;
    petName: StaticMessageKey;
    unlocks: readonly StaticMessageKey[];
  }
> = {
  "1": {
    name: "intimacy:levels.1.name",
    description: "intimacy:levels.1.description",
    petName: "intimacy:levels.1.petName",
    unlocks: ["intimacy:levels.1.unlocks.0"],
  },
  "2": {
    name: "intimacy:levels.2.name",
    description: "intimacy:levels.2.description",
    petName: "intimacy:levels.2.petName",
    unlocks: ["intimacy:levels.2.unlocks.0"],
  },
  "3": {
    name: "intimacy:levels.3.name",
    description: "intimacy:levels.3.description",
    petName: "intimacy:levels.3.petName",
    unlocks: ["intimacy:levels.3.unlocks.0"],
  },
  "4": {
    name: "intimacy:levels.4.name",
    description: "intimacy:levels.4.description",
    petName: "intimacy:levels.4.petName",
    unlocks: ["intimacy:levels.4.unlocks.0"],
  },
  "5": {
    name: "intimacy:levels.5.name",
    description: "intimacy:levels.5.description",
    petName: "intimacy:levels.5.petName",
    unlocks: ["intimacy:levels.5.unlocks.0"],
  },
  "6": {
    name: "intimacy:levels.6.name",
    description: "intimacy:levels.6.description",
    petName: "intimacy:levels.6.petName",
    unlocks: ["intimacy:levels.6.unlocks.0"],
  },
  "7": {
    name: "intimacy:levels.7.name",
    description: "intimacy:levels.7.description",
    petName: "intimacy:levels.7.petName",
    unlocks: ["intimacy:levels.7.unlocks.0"],
  },
  "8": {
    name: "intimacy:levels.8.name",
    description: "intimacy:levels.8.description",
    petName: "intimacy:levels.8.petName",
    unlocks: ["intimacy:levels.8.unlocks.0", "intimacy:levels.8.unlocks.1"],
  },
  "9": {
    name: "intimacy:levels.9.name",
    description: "intimacy:levels.9.description",
    petName: "intimacy:levels.9.petName",
    unlocks: ["intimacy:levels.9.unlocks.0"],
  },
  "10": {
    name: "intimacy:levels.10.name",
    description: "intimacy:levels.10.description",
    petName: "intimacy:levels.10.petName",
    unlocks: ["intimacy:levels.10.unlocks.0", "intimacy:levels.10.unlocks.1"],
  },
};
export const poseMessages: Record<string, StaticMessageKey> = {
  casual: "selfie:poses.casual",
  sweet_smile: "selfie:poses.sweet_smile",
  aegyo: "selfie:poses.aegyo",
  intimate: "selfie:poses.intimate",
  elegant: "selfie:poses.elegant",
  alluring: "selfie:poses.alluring",
  pov_date: "selfie:poses.pov_date",
  morning: "selfie:poses.morning",
  date_night: "selfie:poses.date_night",
};
export const presetMessages: Record<
  string,
  { label: StaticMessageKey; tagline: StaticMessageKey }
> = {
  xiaotao: {
    label: "characters:presets.xiaotao.label",
    tagline: "characters:presets.xiaotao.tagline",
  },
  rin: {
    label: "characters:presets.rin.label",
    tagline: "characters:presets.rin.tagline",
  },
  xiawei: {
    label: "characters:presets.xiawei.label",
    tagline: "characters:presets.xiawei.tagline",
  },
  suwan: {
    label: "characters:presets.suwan.label",
    tagline: "characters:presets.suwan.tagline",
  },
  momoka: {
    label: "characters:presets.momoka.label",
    tagline: "characters:presets.momoka.tagline",
  },
  kirika: {
    label: "characters:presets.kirika.label",
    tagline: "characters:presets.kirika.tagline",
  },
  aoi: {
    label: "characters:presets.aoi.label",
    tagline: "characters:presets.aoi.tagline",
  },
  misaki: {
    label: "characters:presets.misaki.label",
    tagline: "characters:presets.misaki.tagline",
  },
  shiyu: {
    label: "characters:presets.shiyu.label",
    tagline: "characters:presets.shiyu.tagline",
  },
  linxi: {
    label: "characters:presets.linxi.label",
    tagline: "characters:presets.linxi.tagline",
  },
  zhixia: {
    label: "characters:presets.zhixia.label",
    tagline: "characters:presets.zhixia.tagline",
  },
  yuehe: {
    label: "characters:presets.yuehe.label",
    tagline: "characters:presets.yuehe.tagline",
  },
  ningning: {
    label: "characters:presets.ningning.label",
    tagline: "characters:presets.ningning.tagline",
  },
  jiangyue: {
    label: "characters:presets.jiangyue.label",
    tagline: "characters:presets.jiangyue.tagline",
  },
  sakura: {
    label: "characters:presets.sakura.label",
    tagline: "characters:presets.sakura.tagline",
  },
  hikari: {
    label: "characters:presets.hikari.label",
    tagline: "characters:presets.hikari.tagline",
  },
  tsuki: {
    label: "characters:presets.tsuki.label",
    tagline: "characters:presets.tsuki.tagline",
  },
  yuna: {
    label: "characters:presets.yuna.label",
    tagline: "characters:presets.yuna.tagline",
  },
  kaede: {
    label: "characters:presets.kaede.label",
    tagline: "characters:presets.kaede.tagline",
  },
  shiori: {
    label: "characters:presets.shiori.label",
    tagline: "characters:presets.shiori.tagline",
  },
};
export const themeMessages: Record<
  string,
  { name: StaticMessageKey; description: StaticMessageKey }
> = {
  "tokyo-sunset": {
    name: "themes:tokyo-sunset.name",
    description: "themes:tokyo-sunset.description",
  },
  sakura: {
    name: "themes:sakura.name",
    description: "themes:sakura.description",
  },
  midnight: {
    name: "themes:midnight.name",
    description: "themes:midnight.description",
  },
  "neon-mint": {
    name: "themes:neon-mint.name",
    description: "themes:neon-mint.description",
  },
  crimson: {
    name: "themes:crimson.name",
    description: "themes:crimson.description",
  },
  sapphire: {
    name: "themes:sapphire.name",
    description: "themes:sapphire.description",
  },
  lava: {
    name: "themes:lava.name",
    description: "themes:lava.description",
  },
  pearl: {
    name: "themes:pearl.name",
    description: "themes:pearl.description",
  },
};
export const memoryMessages: Record<string, StaticMessageKey> = {
  fact: "memories:categories.fact",
  preference: "memories:categories.preference",
  event: "memories:categories.event",
  relationship: "memories:categories.relationship",
};
