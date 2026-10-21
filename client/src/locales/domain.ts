/** 界面文案按稳定业务 ID 关联；不修改角色资料和聊天内容。 */
import type { StaticMessageKey } from "@shared/i18n";
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
