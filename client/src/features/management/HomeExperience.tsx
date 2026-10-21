/** 首页作为可点击的内容预览，轮播、推荐和问答各自就地编辑。 */
import { type ComponentProps } from "react";
import { useExperienceRoute } from "./managementRoutes";
import { ArrowRight, Pencil, Plus, Settings2 } from "lucide-react";
import { contentText } from "@shared/discovery";
import { Button } from "@/components/ui/button";
import { LandingCarousel } from "@/features/discovery/LandingCarousel";
import { HomepageEditor } from "./HomepageEditor";
import { ExperienceEditor } from "./ProductExperience";

type Props = ComponentProps<typeof HomepageEditor> & {
  dirty: boolean;
  error: string;
  invalid: boolean;
  onSave: () => void;
};
const names: Record<string, string> = {
  featured: "编排精选角色",
  slides: "编辑轮播画面",
  faqs: "编辑常见问题",
  display: "首页展示偏好",
};

/** 先看到首页效果，点击要修改的内容再进入短编辑流程。 */
export function HomeExperience(props: Props) {
  const { value, rows, busy, dirty, error, invalid, onSave } = props;
  const route = useExperienceRoute(busy);
  const editing = route.editing
    ? { task: route.editing, item: route.item }
    : undefined;
  const setEditing = (next?: { task: string; item?: string }) =>
    next ? route.open(next.task, next.item) : route.close();
  const featured = value.featuredIds
    .map(id => rows.find(row => row.id === id))
    .filter(row => !!row);
  return (
    <div className="space-y-8">
      <div className="admin-experience-heading">
        <div>
          <h2>让用户第一次见到的，就是你想推荐的</h2>
          <p>这里呈现当前草稿的首页，点击对应内容即可调整。</p>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => setEditing({ task: "display" })}
        >
          <Settings2 className="size-4" />
          展示偏好
        </Button>
      </div>
      <section className="space-y-4" aria-label="首页轮播预览">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">开场的第一句话</h3>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setEditing({ task: "slides" })}
          >
            <Plus className="size-4" />
            编排轮播
          </Button>
        </div>
        <LandingCarousel
          slides={value.slides.map(slide => ({
            ...slide,
            title: contentText(slide.title, "zh-CN"),
            highlight: contentText(slide.highlight, "zh-CN"),
            action: contentText(slide.action, "zh-CN"),
          }))}
          intervalMs={value.carouselIntervalMs}
          preview
        />
        <div className="admin-home-slide-list">
          {value.slides.map((slide, index) => (
            <Button
              key={slide.id}
              variant="plain"
              size="none"
              className="admin-home-slide-item"
              aria-label={`编辑轮播 ${index + 1}`}
              disabled={busy}
              onClick={() => setEditing({ task: "slides", item: slide.id })}
            >
              <span className="admin-task-tile-icon">0{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">
                {contentText(slide.title, "zh-CN")}
              </span>
              <Pencil className="size-3.5 shrink-0" />
            </Button>
          ))}
        </div>
      </section>
      <section className="admin-panel space-y-5" aria-label="首页精选预览">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">这次想让谁被看见？</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {featured.length} 位精选陪伴，按这里的顺序相遇。
            </p>
          </div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setEditing({ task: "featured" })}
          >
            编排精选
            <ArrowRight className="size-4" />
          </Button>
        </div>
        <div className="admin-featured-preview">
          {featured.map(row => (
            <Button
              key={row.id}
              variant="plain"
              size="none"
              disabled={busy}
              className="flex flex-col gap-2 text-center"
              aria-label={`编排精选 ${row.data.name}`}
              onClick={() => setEditing({ task: "featured" })}
            >
              <img
                src={row.data.imageUrl}
                alt=""
                className="aspect-square w-full rounded-full object-cover"
              />
              <strong className="text-xs">{row.data.name}</strong>
              <span className="line-clamp-1 text-[10px] text-muted-foreground">
                {contentText(row.data.label, "zh-CN")}
              </span>
            </Button>
          ))}
        </div>
        {!featured.length && (
          <p className="admin-empty">还没有精选角色，挑几位陪伴放在这里。</p>
        )}
      </section>
      <section className="space-y-4" aria-label="首页问答预览">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">把疑问温柔地接住</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              让用户更容易开始第一次陪伴。
            </p>
          </div>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setEditing({ task: "faqs" })}
          >
            <Plus className="size-4" />
            管理问答
          </Button>
        </div>
        <div className="space-y-3">
          {value.faqs.map(faq => (
            <article key={faq.id} className="admin-faq-preview">
              <div className="min-w-0 flex-1">
                <h4 className="font-medium">
                  {contentText(faq.question, "zh-CN")}
                </h4>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                  {contentText(faq.answer, "zh-CN")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                disabled={busy}
                aria-label={`编辑问答 ${contentText(faq.question, "zh-CN")}`}
                onClick={() => setEditing({ task: "faqs", item: faq.id })}
              >
                <Pencil className="size-4" />
              </Button>
            </article>
          ))}
        </div>
      </section>
      {editing && (
        <ExperienceEditor
          title={names[editing.task]}
          description="修改后回到首页预览，满意后保存并发布。"
          busy={busy}
          dirty={dirty}
          invalid={invalid}
          error={error}
          onSave={onSave}
          onClose={() => setEditing(undefined)}
        >
          <HomepageEditor
            key={editing.task + editing.item}
            {...props}
            focusedTab={editing.task}
            focusItem={editing.item}
          />
        </ExperienceEditor>
      )}
    </div>
  );
}
