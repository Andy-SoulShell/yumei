/** 从运营目标进入相互关联的页面，而不是先理解配置模块名。 */
import { Button } from "@/components/ui/button";
import type { Pane } from "./managementModel";
const tasks: { title: string; description: string; links: [Pane, string][] }[] =
  [
    {
      title: "让用户第一次见到她",
      description: "角色提供内容，首页决定推荐谁，主题与页脚完成展示。",
      links: [
        ["official", "打磨角色"],
        ["home", "编排推荐"],
        ["themes", "选择外观"],
        ["site", "公开说明"],
      ],
    },
    {
      title: "让相处逐渐有变化",
      description: "默认行为决定起点，互动积累关系，情绪影响当下语气。",
      links: [
        ["characters", "相处起点"],
        ["intimacy", "关系成长"],
        ["emotion", "情绪回应"],
      ],
    },
    {
      title: "让她记住，并适时关心",
      description: "聊天提取记忆，等级决定容量，用户授权后才安排主动联系。",
      links: [
        ["memory", "记忆与回忆"],
        ["proactive", "联系安排"],
        ["prompts", "生成指令"],
      ],
    },
    {
      title: "让图片、视频和语音顺利使用",
      description: "先满足文件规则与权益，再交给服务生成，最后按体验设置展示。",
      links: [
        ["uploads", "上传与录音"],
        ["selfies", "可选姿势"],
        ["videos", "视频动作"],
        ["models", "生成服务"],
        ["experience", "播放与浏览"],
      ],
    },
    {
      title: "把服务权益交付给用户",
      description: "计费模式决定套餐如何授予；模型与执行规则决定实际交付。",
      links: [
        ["billing", "套餐与额度"],
        ["models", "AI 服务"],
        ["runtime", "等待与执行"],
      ],
    },
    {
      title: "让修改安全上线",
      description:
        "编辑后保存草稿，再核对影响。角色与首页一起发布，业务设置单独发布。",
      links: [["publish", "核对并发布"]],
    },
  ];
export function ExperienceMap({
  disabled,
  onNavigate,
}: {
  disabled: boolean;
  onNavigate: (pane: Pane) => void;
}) {
  return (
    <section aria-label="按用户体验找到设置">
      <h2 className="text-lg font-semibold">你想改善哪段体验？</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tasks.map(task => (
          <article key={task.title} className="admin-journey-card p-5">
            <h3 className="text-sm font-semibold">{task.title}</h3>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              {task.description}
            </p>
            <div className="mt-3 flex flex-wrap gap-1">
              {task.links.map(([pane, name]) => (
                <Button
                  key={pane}
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => onNavigate(pane)}
                >
                  {name}
                </Button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
