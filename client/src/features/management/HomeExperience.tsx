/** 首页作为可点击的内容预览，轮播、推荐和问答各自就地编辑。 */
import { type ComponentProps } from "react";
import { useExperienceRoute } from "./managementRoutes";
import { ArrowLeft, ArrowRight, Pencil, Plus, Settings2 } from "lucide-react";
import { contentText } from "@shared/discovery";
import { Button } from "@/components/ui/button";
import { LandingCarousel } from "@/features/discovery/LandingCarousel";
import { HomepageEditor, OrderActions } from "./HomepageEditor";
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
  const isCollection = editing && ["slides", "faqs"].includes(editing.task);
  const closeEditor = () =>
    isCollection && editing.item ? route.closeItem() : route.close();
  const editor = editing && (!isCollection || editing.item) && (
    <ExperienceEditor
      title={names[editing.task]}
      description="修改后回到首页预览，满意后保存并发布。"
      busy={busy}
      dirty={dirty}
      invalid={invalid}
      error={error}
      onSave={onSave}
      onClose={closeEditor}
    >
      <HomepageEditor
        key={editing.task + editing.item}
        {...props}
        onChange={next => {
          props.onChange(next);
          if (
            isCollection &&
            editing.item &&
            !next[editing.task as "slides" | "faqs"].some(
              item => item.id === editing.item
            )
          )
            closeEditor();
        }}
        focusedTab={editing.task}
        focusItem={editing.item}
      />
    </ExperienceEditor>
  );
  if (isCollection) {
    const key = editing.task as "slides" | "faqs";
    const list = value[key];
    return (
      <div className="space-y-6">
        <Button variant="ghost" disabled={busy} onClick={route.close}>
          <ArrowLeft className="size-4" />
          返回首页预览
        </Button>
        <div className="admin-experience-heading">
          <div>
            <h2>{key === "slides" ? "编排轮播" : "管理问答"}</h2>
            <p>先安排展示顺序，选择一条内容再编辑文案。</p>
          </div>
          <Button
            variant="outline"
            disabled={
              busy ||
              list.length >= (key === "slides" ? 20 : 50) ||
              (key === "slides" &&
                !rows.some(row => !row.archived) &&
                !value.slides.length)
            }
            onClick={() => {
              const id = `${key}-${crypto.randomUUID().slice(0, 8)}`;
              const next =
                key === "slides"
                  ? {
                      ...value,
                      slides: [
                        ...value.slides,
                        {
                          id,
                          title: { "zh-CN": "新的相遇" },
                          highlight: { "zh-CN": "从一句你好开始。" },
                          action: { "zh-CN": "探索角色" },
                          href: "/explore",
                          images: [
                            rows.find(row => !row.archived)?.data.imageUrl ||
                              value.slides[0]?.images[0],
                          ],
                        },
                      ],
                    }
                  : {
                      ...value,
                      faqs: [
                        ...value.faqs,
                        {
                          id,
                          question: { "zh-CN": "" },
                          answer: { "zh-CN": "" },
                        },
                      ],
                    };
              props.onChange(next);
              route.open(key, id);
            }}
          >
            <Plus className="size-4" />
            {key === "slides" ? "新增轮播" : "新增问答"}
          </Button>
        </div>
        <fieldset
          disabled={busy}
          className="space-y-3"
          aria-label={key === "slides" ? "轮播顺序" : "问答顺序"}
        >
          {list.map((item, index) => {
            const label =
              key === "slides" ? `轮播${index + 1}` : `问答${index + 1}`;
            const title = contentText(
              "title" in item ? item.title : item.question,
              "zh-CN"
            );
            return (
              <article
                key={item.id}
                className={`admin-panel grid items-center gap-4 ${"images" in item ? "grid-cols-[4rem_minmax(0,1fr)]" : "grid-cols-1"} sm:flex sm:flex-nowrap`}
              >
                {"images" in item && (
                  <img
                    src={item.images[0]}
                    alt=""
                    className="size-16 rounded-xl object-cover"
                  />
                )}
                <Button
                  variant="plain"
                  size="none"
                  className="min-w-0 flex-1 flex-col items-start text-left whitespace-normal"
                  aria-label={`编辑${label}`}
                  onClick={() => route.open(key, item.id)}
                >
                  <strong className="block text-sm">
                    {index + 1}. {title}
                  </strong>
                  <span className="mt-2 line-clamp-2 block text-xs leading-6 text-muted-foreground">
                    {contentText(
                      "highlight" in item ? item.highlight : item.answer,
                      "zh-CN"
                    )}
                  </span>
                </Button>
                <div className="col-span-full flex justify-end">
                  <OrderActions
                    index={index}
                    length={list.length}
                    label={label}
                    onMove={target => {
                      const next = [...list];
                      [next[index], next[target]] = [next[target], next[index]];
                      props.onChange({ ...value, [key]: next });
                    }}
                    onRemove={() => {
                      props.onChange({
                        ...value,
                        [key]: list.filter(row => row.id !== item.id),
                      });
                    }}
                  />
                </div>
              </article>
            );
          })}
          {!list.length && (
            <p className="admin-empty">还没有内容，先添加第一条。</p>
          )}
        </fieldset>
        {editor}
      </div>
    );
  }
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
      {editor}
    </div>
  );
}
