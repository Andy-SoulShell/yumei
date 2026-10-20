/** 公开目录的展示数量与人工精选名单，和个人角色数据分别维护。 */
import { getCharacterPreset } from "@shared/characterPresets";

export const CATALOGUE_PAGE_SIZE = 20;
export const HOME_CHARACTER_LIMIT = 20;

/** 精选顺序独立于目录顺序，新增角色后可直接在这里调整。 */
export const FEATURED_CHARACTERS = [
  "xiaotao",
  "rin",
  "linxi",
  "zhixia",
  "momoka",
  "hikari",
  "kaede",
  "shiori",
  "shiyu",
  "sakura",
].flatMap(id => {
  const preset = getCharacterPreset(id);
  return preset ? [preset] : [];
});
