import type { CompanionBehavior } from "@shared/companionBehavior";

/** 展示已发布的相处设置，不从形象或身份推断性格。 */
export function characterTraitKeys(behavior: CompanionBehavior) {
  return [
    (
      {
        warm: "setup:behaviorExpressionWarm",
        direct: "setup:behaviorExpressionDirect",
        playful: "setup:behaviorExpressionPlayful",
        reserved: "setup:behaviorExpressionReserved",
      } as const
    )[behavior.expression],
    (
      {
        gradual: "setup:behaviorRelationshipPaceGradual",
        natural: "setup:behaviorRelationshipPaceNatural",
      } as const
    )[behavior.relationshipPace],
    (
      {
        quiet: "setup:behaviorInitiativeQuiet",
        balanced: "setup:behaviorInitiativeBalanced",
        lively: "setup:behaviorInitiativeLively",
      } as const
    )[behavior.initiative],
  ] as const;
}
