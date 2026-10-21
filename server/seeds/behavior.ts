/** 默认角色行为的初始数据，仅供初始化目录使用。 */
import data from "./product.json";
import { companionBehaviorSchema } from "../../shared/companionBehavior";
export const initialBehavior = companionBehaviorSchema.parse(
  data.characters.defaultBehavior
);
