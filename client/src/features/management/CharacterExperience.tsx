/** 官方角色以人物档案呈现，资料、封面和相处细节分别就地编辑。 */
import { type ComponentProps } from "react";
import { useExperienceRoute } from "./managementRoutes";
import { Camera, ChevronRight, Heart, Pencil, Sparkles } from "lucide-react";
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
/** 把字段收进单一任务编辑器，默认阅读角色故事与前台效果。 */
export function CharacterExperience(props: Props) {
  const { value, busy, dirty, error, creating, onSave } = props;
  const route = useExperienceRoute(busy);
  const editing = route.editing as Part | undefined;
  const setEditing = (next?: Part) => (next ? route.open(next) : route.close());
  const task = tasks.find(item => item.id === editing);
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
