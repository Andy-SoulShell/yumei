/** 管理导航与内容状态围绕运营任务组织，共用真实草稿和发布快照。 */
import type { ProductConfig } from "@shared/productConfig";
import type { OfficialCharacter } from "@shared/discovery";
import { sameConfigValue } from "./editorState";
export type Pane =
  "overview" | "official" | "home" | "publish" | keyof ProductConfig;
export const sections: {
  id: keyof ProductConfig;
  name: string;
  description: string;
  group: string;
}[] = [
  {
    id: "themes",
    name: "主题配色",
    description: "调整品牌颜色与明暗外观，直接预览配色效果。",
    group: "品牌与体验",
  },
  {
    id: "site",
    name: "运营链接与页脚",
    description: "维护公开说明、支持入口与服务链接。",
    group: "品牌与体验",
  },
  {
    id: "prompts",
    name: "提示词模板",
    description: "管理快捷模板与各类生成提示，保留必要的模板变量。",
    group: "品牌与体验",
  },
  {
    id: "selfies",
    name: "自拍姿势",
    description: "管理姿势名称、画面提示和解锁等级。",
    group: "品牌与体验",
  },
  {
    id: "videos",
    name: "视频动作",
    description: "独立管理招手、比心、转身等动作、提示词与解锁等级。",
    group: "品牌与体验",
  },
  {
    id: "billing",
    name: "套餐与额度",
    description: "管理套餐、价格、模型权益与使用额度。",
    group: "业务规则",
  },
  {
    id: "intimacy",
    name: "亲密度规则",
    description: "设置等级、互动奖励、冷却与每日上限。",
    group: "业务规则",
  },
  {
    id: "characters",
    name: "角色默认与上限",
    description: "设置新角色的默认相处方式和资料字数限制。",
    group: "业务规则",
  },
  {
    id: "emotion",
    name: "情绪规则",
    description: "管理情绪基线、恢复方式与心情展示。",
    group: "业务规则",
  },
  {
    id: "memory",
    name: "记忆规则",
    description: "管理记忆容量、检索、提取和摘要。",
    group: "业务规则",
  },
  {
    id: "proactive",
    name: "主动联系与通知",
    description: "管理联系频率、免打扰默认值和通知文案。",
    group: "业务规则",
  },
  {
    id: "uploads",
    name: "上传与录音",
    description: "管理图片、音频的格式、容量及录音时长。",
    group: "系统设置",
  },
  {
    id: "models",
    name: "模型与工作流",
    description: "维护模型、运营网关和 ComfyUI 工作流，凭据由服务端保管。",
    group: "系统设置",
  },
  {
    id: "runtime",
    name: "执行与回收",
    description: "调整执行预算、超时、并发与后台回收。",
    group: "系统设置",
  },
  {
    id: "experience",
    name: "分页、播放与连接",
    description: "调整列表容量、朗读及连接体验。",
    group: "系统设置",
  },
];
export type CharacterRow = {
  id: string;
  data: OfficialCharacter;
  archived: boolean;
  updatedAt?: Date | string;
};
export function characterStatus(
  row: CharacterRow,
  published: readonly OfficialCharacter[]
) {
  const live = published.find(item => item.id === row.id);
  if (row.archived) return live ? "待下架" : "已归档";
  if (!live) return "待发布";
  if (!sameConfigValue(row.data, live)) return "待更新";
  return row.data.listed ? "已发布" : "未公开";
}
export function filterCharacters(
  rows: CharacterRow[],
  published: readonly OfficialCharacter[],
  query: string,
  filter: string,
  sort: string
) {
  return rows
    .filter(row => {
      const status = characterStatus(row, published);
      const match =
        !query.trim() ||
        `${row.data.name} ${row.data.label["zh-CN"] || ""} ${row.id} ${row.data.interests}`
          .toLowerCase()
          .includes(query.trim().toLowerCase());
      return (
        match &&
        (filter === "all"
          ? !row.archived
          : filter === "pending"
            ? ["待发布", "待更新", "待下架"].includes(status)
            : filter === "archived"
              ? row.archived
              : filter === "unlisted"
                ? !row.archived && !row.data.listed
                : status === "已发布")
      );
    })
    .sort((a, b) =>
      sort === "name"
        ? a.data.name.localeCompare(b.data.name, "zh-CN")
        : sort === "recent"
          ? new Date(b.updatedAt || 0).getTime() -
            new Date(a.updatedAt || 0).getTime()
          : a.data.sortOrder - b.data.sortOrder || a.id.localeCompare(b.id)
    );
}
