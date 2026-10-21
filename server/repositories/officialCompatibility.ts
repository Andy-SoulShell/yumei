/** 官方模板必须能通过用户创建角色时的同一套字段校验。 */
import { TRPCError } from "@trpc/server";
import type { OfficialCharacter } from "../../shared/discovery";
import { characterFieldsError } from "../../shared/experienceConfig";
import type { ProductConfig } from "../../shared/productConfig";

export function validateOfficialCharacterFields(
  characters: readonly OfficialCharacter[],
  rules: ProductConfig["characters"]
) {
  for (const character of characters) {
    const error = characterFieldsError(character, rules);
    if (error)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `官方角色 ${character.id}：${error}`,
      });
  }
}
