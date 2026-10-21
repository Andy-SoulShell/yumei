/** 自拍姿势纯查询，调用方显式传入已发布配置。 */
import type { SelfiePose } from "./productConfig";
export type { SelfiePose } from "./productConfig";

/** 只返回当前启用的指定姿势，未知或停用 ID 返回 undefined。 */
export function getPose(id: string, poses: readonly SelfiePose[]) {
  return poses.find(pose => pose.id === id && pose.enabled);
}

/** 按实际解锁等级筛选启用姿势。 */
export function posesForLevel(level: number, poses: readonly SelfiePose[]) {
  return poses.filter(pose => pose.enabled && pose.minLevel <= level);
}
