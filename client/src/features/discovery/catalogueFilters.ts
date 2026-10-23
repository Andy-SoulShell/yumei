import type { CharacterPreset } from "@shared/discovery";
export const CATALOGUE_TAGS = [
  "all",
  "warm",
  "playful",
  "direct",
  "reserved",
  "gradual",
  "lively",
] as const;
export type CatalogueTag = (typeof CATALOGUE_TAGS)[number];
export const CATALOGUE_SORTS = [
  "recommended",
  "newest",
  "name",
  "age",
] as const;
export type CatalogueSort = (typeof CATALOGUE_SORTS)[number];
export const AGE_FILTERS = ["all", "18-24", "25-34", "35+"] as const;
export function matchesTag(role: CharacterPreset, tag: string) {
  if (["warm", "playful", "direct", "reserved"].includes(tag))
    return role.behavior.expression === tag;
  if (tag === "gradual") return role.behavior.relationshipPace === "gradual";
  if (tag === "lively") return role.behavior.initiative === "lively";
  return true;
}
export function matchesAge(role: CharacterPreset, age: string) {
  return age === "18-24"
    ? role.age >= 18 && role.age <= 24
    : age === "25-34"
      ? role.age >= 25 && role.age <= 34
      : age === "35+"
        ? role.age >= 35
        : true;
}
