/** 官方角色以人物档案呈现，资料、封面和相处细节分别就地编辑。 */
import { type ComponentProps } from "react";
import { useExperienceRoute } from "./managementRoutes";
import {
  ArrowLeft,
  Camera,
  ChevronRight,
  Heart,
  Pencil,
  Plus,
  Sparkles,
} from "lucide-react";
import { contentText } from "@shared/discovery";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OfficialCharacterForm } from "./OfficialCharacterForm";
import { ExperienceEditor } from "./ProductExperience";

type Part = "basic" | "display" | "more";
type Props = ComponentProps<typeof OfficialCharacterForm> & {
  dirty: boolean;
  error: string;
  creating: boolean;
  onSave: () => void;
};
const tasks = [
  {
    id: "basic" as Part,
    title: "名字与故事",
    description: "名字、年龄、画面风格和人物设定",
    icon: Pencil,
  },
  {
    id: "display" as Part,
    title: "封面与介绍",
    description: "选一张照片，写一句让人记住的介绍",
    icon: Camera,
  },
  {
    id: "more" as Part,
    title: "相处的细节",
    description: "外貌、兴趣、称呼、表达与更多个性",
    icon: Heart,
  },
];
const detailTasks = [
  ["appearance", "外貌说明"],
  ["interests", "兴趣"],
  ["nickname", "对用户的称呼"],
  ["expression", "表达与主动性"],
  ["relationship", "关系节奏与情感"],
  ["en", "English 展示文案"],
  ["ja", "日本語 展示文案"],
  ["ko", "한국어 展示文案"],
  ["sort", "展示顺序"],
  ["resource", "图片资源"],
];
/** 把字段收进单一任务编辑器，默认阅读角色故事与前台效果。 */
export function CharacterExperience(props: Props) {
  const { value, busy, dirty, error, creating, onSave } = props;
  const route = useExperienceRoute(busy);
  const editing = route.editing as Part | undefined;
  const setEditing = (next?: Part) => (next ? route.open(next) : route.close());
  const task = tasks.find(item => item.id === editing);
  if (editing === "more") {
    const details = [
      ...detailTasks,
      ...value.behavior.examples.map((_, index) => [
        `example.${index}`,
        `示例对话 ${index + 1}`,
      ]),
    ];
    const selected = details.find(([id]) => id === route.item);
    return (
      <div className="space-y-6">
        <Button variant="ghost" disabled={busy} onClick={route.close}>
          <ArrowLeft className="size-4" />
          返回人物档案
        </Button>
        <div className="admin-experience-heading">
          <div>
            <h2>相处的细节</h2>
            <p>选择想打磨的细节，其他资料会保留在同一份角色草稿中。</p>
          </div>
          <Button
            variant="outline"
            disabled={
              busy ||
              value.behavior.examples.length >= props.rules.limits.exampleCount
            }
            onClick={() => {
              const index = value.behavior.examples.length;
              props.onChange({
                ...value,
                behavior: {
                  ...value.behavior,
                  examples: [
                    ...value.behavior.examples,
                    { user: "你好", assistant: "很高兴见到你。" },
                  ],
                },
              });
              route.open("more", `example.${index}`);
            }}
          >
            <Plus className="size-4" />
            添加示例对话
          </Button>
        </div>
        <div className="admin-workbench-grid">
          {details.map(([id, title]) => (
            <Button
              variant="plain"
              size="none"
              key={id}
              className="admin-workbench-card"
              disabled={busy}
              aria-label={`编辑${title}`}
              onClick={() => route.open("more", id)}
            >
              <strong>{title}</strong>
              <span className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                {id === "appearance"
                  ? value.appearance || "留空以封面为准"
                  : id === "interests"
                    ? value.interests || "添加喜欢的事"
                    : id === "nickname"
                      ? value.behavior.userNickname || "由角色自然称呼"
                      : "单独调整这项细节"}
              </span>
            </Button>
          ))}
        </div>
        {selected && (
          <ExperienceEditor
            title={selected[1]}
            description="修改会保留在角色草稿中，返回人物档案即可预览。"
            busy={busy}
            dirty={dirty}
            error={error}
            invalid={Object.keys(props.issues).length > 0}
            onSave={onSave}
            onClose={route.closeItem}
          >
            <OfficialCharacterForm
              {...props}
              focusedPart="more"
              focusedDetail={selected[0]}
            />
            {selected[0].startsWith("example.") && (
              <Button
                className="mt-5"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  const index = Number(selected[0].split(".")[1]);
                  props.onChange({
                    ...value,
                    behavior: {
                      ...value.behavior,
                      examples: value.behavior.examples.filter(
                        (_, at) => at !== index
                      ),
                    },
                  });
                  route.closeItem();
                }}
              >
                移除此示例对话
              </Button>
            )}
          </ExperienceEditor>
        )}
        {route.item && !selected && (
          <p role="status">这项细节已不存在，请重新选择。</p>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <article className="admin-character-story">
        <div className="mb-5 flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <Badge variant="secondary">
            {value.style === "anime" ? "动漫" : "写实"} · {value.age} 岁
          </Badge>
          <Badge variant="outline">
            {value.listed ? "探索页可见" : "暂不公开"}
          </Badge>
        </div>
        <h2 className="text-3xl font-semibold tracking-tight">
          {value.name || "一位新的陪伴"}
        </h2>
        <p className="mt-3 text-primary">
          {contentText(value.label, "zh-CN") || "给她一个让人记住的身份"}
        </p>
        <p className="mt-5 text-lg leading-8">
          {contentText(value.tagline, "zh-CN") || "一句介绍，开启下一次相遇。"}
        </p>
        <div className="mt-6 border-t pt-6">
          <h3 className="mb-3 text-xs font-medium text-muted-foreground">
            她的故事
          </h3>
          <p className="whitespace-pre-wrap text-sm leading-8">
            {value.personality ||
              "从她是谁、喜欢什么、如何与你相处开始，写下属于她的故事。"}
          </p>
        </div>
        {value.interests && (
          <p className="mt-5 text-xs leading-6 text-muted-foreground">
            喜欢的事 · {value.interests}
          </p>
        )}
      </article>
      <div className="space-y-3">
        {tasks.map(item => (
          <Button
            key={item.id}
            variant="plain"
            size="none"
            className="admin-task-tile w-full"
            disabled={busy}
            onClick={() => setEditing(item.id)}
            aria-label={`编辑${item.title}`}
          >
            <span className="admin-experience-icon">
              <item.icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <strong>{item.title}</strong>
              <span className="mt-2 block text-xs leading-6 text-muted-foreground">
                {item.description}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        ))}
      </div>
      {editing && task && (
        <ExperienceEditor
          title={
            creating && editing === "basic" ? "让她有自己的故事" : task.title
          }
          description={task.description}
          busy={busy}
          dirty={dirty}
          error={error}
          invalid={Object.keys(props.issues).length > 0}
          onSave={onSave}
          onClose={() => setEditing(undefined)}
        >
          <OfficialCharacterForm {...props} focusedPart={editing} />
        </ExperienceEditor>
      )}
    </div>
  );
}
