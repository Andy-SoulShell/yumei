/** 桌面侧栏与手机抽屉共用管理入口、搜索和当前分区状态。 */
import { Link } from "wouter";
import { useId } from "react";
import {
  Bell,
  Brain,
  ChevronRight,
  CreditCard,
  FileText,
  Heart,
  Image,
  LayoutDashboard,
  Link2,
  Menu,
  MessageSquare,
  Palette,
  Play,
  Search,
  Send,
  Server,
  Settings2,
  SlidersHorizontal,
  Smile,
  Upload,
  Users,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExperimentalGlassToggle } from "@/components/ExperimentalGlassToggle";
import { sections, type Pane } from "./managementModel";

const icons: Partial<Record<Pane, LucideIcon>> = {
  themes: Palette,
  site: Link2,
  prompts: MessageSquare,
  selfies: Image,
  videos: Video,
  billing: CreditCard,
  intimacy: Heart,
  characters: Users,
  emotion: Smile,
  memory: Brain,
  proactive: Bell,
  uploads: Upload,
  models: Server,
  runtime: SlidersHorizontal,
  experience: Play,
};

/** 所有管理入口共享名称、分组和图标，避免桌面与手机导航漂移。 */
export const managementMenu = [
  {
    id: "overview" as Pane,
    name: "工作台",
    group: "内容管理",
    description: "快速创建与最近编辑",
    icon: LayoutDashboard,
  },
  {
    id: "official" as Pane,
    name: "官方角色",
    group: "内容管理",
    description: "角色库 人设 草稿 归档",
    icon: Users,
  },
  {
    id: "home" as Pane,
    name: "首页、轮播与 FAQ",
    group: "内容管理",
    description: "精选 推荐 问答 轮播",
    icon: FileText,
  },
  {
    id: "publish" as Pane,
    name: "发布中心",
    group: "内容管理",
    description: "待发布 变更 影响范围",
    icon: Send,
  },
  ...sections.map(item => ({ ...item, icon: icons[item.id] ?? Settings2 })),
];

/** 分组功能列表；抽屉和侧栏使用相同的可搜索导航。 */
export function ManagementNavigation({
  pane,
  query,
  onQueryChange,
  busy,
  onNavigate,
}: {
  pane: Pane;
  query: string;
  onQueryChange: (query: string) => void;
  busy: boolean;
  onNavigate: (pane: Pane) => void;
}) {
  const id = useId();
  const matches = managementMenu.filter(item =>
    `${item.name} ${item.description}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );
  return (
    <>
      <div className="admin-nav-search">
        <Search className="size-4" aria-hidden="true" />
        <Input
          aria-label="查找管理功能"
          placeholder="查找管理功能…"
          value={query}
          onChange={event => onQueryChange(event.target.value)}
          disabled={busy}
        />
        {query && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="清除功能搜索"
            disabled={busy}
            onClick={() => onQueryChange("")}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
      <nav className="admin-navigation" aria-label="管理导航">
        {["内容管理", "品牌与体验", "业务规则", "系统设置"].map(
          (group, index) => {
            const items = matches.filter(item => item.group === group);
            return (
              items.length > 0 && (
                <section
                  className="admin-nav-group"
                  key={group}
                  aria-labelledby={`${id}-${index}`}
                >
                  <h2 id={`${id}-${index}`}>{group}</h2>
                  <div className="space-y-1">
                    {items.map(item => (
                      <Button
                        key={item.id}
                        variant="ghost"
                        className="admin-nav-item"
                        disabled={busy}
                        aria-current={pane === item.id ? "page" : undefined}
                        onClick={() => onNavigate(item.id)}
                      >
                        <item.icon className="size-4" aria-hidden="true" />
                        <span>{item.name}</span>
                        {pane === item.id && (
                          <ChevronRight
                            className="ml-auto size-3.5"
                            aria-hidden="true"
                          />
                        )}
                      </Button>
                    ))}
                  </div>
                </section>
              )
            );
          }
        )}
        {!matches.length && (
          <div role="status" className="admin-nav-empty">
            <Search className="mx-auto mb-3 size-6" aria-hidden="true" />
            <p>没有找到相关功能</p>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onQueryChange("")}
            >
              清除搜索
            </Button>
          </div>
        )}
      </nav>
      <div className="admin-nav-footer">
        <Link
          href="/admin/commerce"
          className="block px-3 py-3 text-sm underline"
        >
          社区审核与创作者结算
        </Link>
        <ExperimentalGlassToggle compact />
      </div>
    </>
  );
}

/** 手机端常用入口固定在底部，其余设置通过抽屉进入。 */
export function ManagementDock({
  pane,
  busy,
  onNavigate,
  onOpenMenu,
  menuOpen,
}: {
  pane: Pane;
  busy: boolean;
  onNavigate: (pane: Pane) => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
}) {
  return (
    <nav className="admin-dock" aria-label="管理快捷导航">
      {managementMenu.slice(0, 4).map(item => (
        <Button
          key={item.id}
          variant="ghost"
          aria-current={pane === item.id ? "page" : undefined}
          disabled={busy}
          onClick={() => onNavigate(item.id)}
        >
          <item.icon aria-hidden="true" />
          <span>
            {item.id === "official"
              ? "角色库"
              : item.id === "home"
                ? "首页"
                : item.name}
          </span>
        </Button>
      ))}
      <Button
        variant="ghost"
        disabled={busy}
        onClick={onOpenMenu}
        aria-label="全部管理功能"
        aria-expanded={menuOpen}
        aria-haspopup="dialog"
        data-active={
          !managementMenu.slice(0, 4).some(item => item.id === pane) ||
          undefined
        }
      >
        <Menu aria-hidden="true" />
        <span>全部功能</span>
      </Button>
    </nav>
  );
}
