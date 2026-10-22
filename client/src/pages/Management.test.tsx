// @vitest-environment jsdom
/** 真实后台组件和查询缓存：写入及重读完成前保护当前编辑器，失败时保留输入。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { getQueryKey } from "@trpc/react-query";
import { trpc } from "@/lib/trpc";
import { productFixture } from "../../../server/testProductConfig";
import { initialDiscovery } from "../../../server/seeds/discovery";
import Management from "./Management";

let root: Root, container: HTMLDivElement, cache: QueryClient;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/admin");
  HTMLElement.prototype.scrollTo = vi.fn();
  window.scrollTo = vi.fn();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  container.remove();
  vi.restoreAllMocks();
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
async function waitFor(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }
  expect(check()).toBe(true);
}
function button(text: string) {
  const result = Array.from(document.querySelectorAll("button")).find(
    item =>
      item.textContent?.trim() === text ||
      item.getAttribute("aria-label") === text
  );
  expect(result).toBeTruthy();
  return result!;
}
async function click(text: string) {
  expect(button(text).disabled).toBe(false);
  await act(async () => button(text).click());
}
async function change(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
) {
  await act(async () => {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      element,
      value
    );
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
function editor(value: string) {
  const result = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input,textarea"
    )
  ).find(item => item.value === value);
  expect(result).toBeTruthy();
  return result!;
}
function field(label: string) {
  const element = Array.from(document.querySelectorAll("label")).find(
    item => item.textContent === label
  );
  expect(element).toBeTruthy();
  return document.getElementById(element!.htmlFor) as HTMLInputElement;
}

type Workspace = "product" | "home" | "character";
async function mount(
  workspace: Workspace,
  action: "save" | "publish",
  fail?: "write" | "reload"
) {
  const write = deferred(),
    reload = deferred();
  const product = {
    config: structuredClone(productFixture),
    published: structuredClone(productFixture),
    revision: 2,
    publishedRevision: 1,
    publishedAt: new Date(),
  };
  const seed = initialDiscovery();
  const content = {
    published: structuredClone(seed),
    home: structuredClone(seed.home),
    characters: seed.characters.map(data => ({
      id: data.id,
      data: structuredClone(data),
      archived: false,
    })),
    revision: 2,
    publishedRevision: 1,
    publishedAt: new Date(),
  };
  if (action === "publish") {
    product.config.site.disclosure["zh-CN"] += "（待发布）";
    product.config.uploads.avatar.maxBytes = 1024;
    content.characters[0].data.name += "（待发布）";
    content.characters[1].data.tagline["zh-CN"] = "另一个角色的待发布介绍";
    content.home.pageSize++;
  }
  const target =
    workspace === "product" ? "productConfig.admin" : "discovery.admin";
  const procedure = `${target}.${action === "publish" ? "publish" : workspace === "product" ? "save" : workspace === "home" ? "saveHomepage" : "saveCharacter"}`;
  let writing = false,
    reloading = false,
    reads = 0;
  const calls: string[] = [];
  const client = trpc.createClient({
    links: [
      () =>
        ({ op }) =>
          observable(observer => {
            void (async () => {
              calls.push(op.path);
              let data: unknown;
              if (op.path === "management.status")
                data = { configured: true, authenticated: true };
              else if (op.path === "productConfig.get")
                data = {
                  ...product.config,
                  revision: product.publishedRevision,
                  publishedAt: product.publishedAt,
                };
              else if (op.path === "discovery.get") data = seed;
              else if (op.path.endsWith(".getDraft")) {
                if (op.path === `${target}.getDraft` && ++reads > 1) {
                  reloading = true;
                  await reload.promise;
                  if (fail === "reload")
                    throw new Error("草稿重读失败，请重试");
                }
                data = op.path.startsWith("productConfig") ? product : content;
              } else if (op.path === procedure) {
                writing = true;
                await write.promise;
                if (fail === "write") throw new Error("保存失败，请重试");
                const input = op.input as any;
                if (action === "save") {
                  if (workspace === "product") product.config = input.config;
                  else if (workspace === "home") content.home = input.home;
                  else {
                    const existing = content.characters.find(
                      item => item.id === input.character.id
                    );
                    if (existing) existing.data = input.character;
                    else
                      content.characters.push({
                        id: input.character.id,
                        data: input.character,
                        archived: false,
                      });
                  }
                }
                const draft = workspace === "product" ? product : content;
                draft.revision++;
                if (action === "publish")
                  draft.publishedRevision = draft.revision;
                data = {
                  revision: draft.revision,
                  published: action === "publish",
                };
              } else throw new Error(`Unexpected procedure ${op.path}`);
              observer.next({ result: { data: structuredClone(data) } });
              observer.complete();
            })().catch(error => observer.error(TRPCClientError.from(error)));
            return () => {};
          }),
    ],
  });
  await act(async () =>
    root.render(
      <trpc.Provider client={client} queryClient={cache}>
        <QueryClientProvider client={cache}>
          <Management />
        </QueryClientProvider>
      </trpc.Provider>
    )
  );
  await waitFor(
    () => !!container.querySelector("nav") && !button("套餐与额度").disabled
  );
  const title =
    workspace === "product"
      ? "运营链接与页脚"
      : workspace === "home"
        ? "首页内容"
        : "官方角色";
  await click(
    workspace === "product"
      ? title
      : workspace === "home"
        ? "首页、轮播与 FAQ"
        : title
  );
  if (workspace === "character")
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          `[aria-label="编辑角色 ${content.characters[0].data.name}"]`
        )!
        .click()
    );
  if (workspace === "character")
    if (action === "save") {
      await waitFor(
        () => !!document.querySelector('[aria-label="编辑名字与故事"]')
      );
      await click("编辑名字与故事");
      await waitFor(() => !!document.querySelector('input[id$="-name"]'));
    }
  if (workspace === "product" && action === "save") await click("编辑页脚说明");
  return {
    write,
    reload,
    product,
    content,
    title,
    calls,
    writing: () => writing,
    reloading: () => reloading,
  };
}

it.each<Workspace>(["product", "home", "character"])(
  "protects %s edits throughout saving and the following draft reload",
  async workspace => {
    const state = await mount(workspace, "save");
    let value: string;
    if (workspace === "product") {
      value = "保存完成前保留的运营文案";
      await change(
        editor(state.product.config.site.disclosure["zh-CN"]!),
        value
      );
    } else if (workspace === "home") {
      await click("JSON");
      value = JSON.stringify({ ...state.content.home, pageSize: 21 }, null, 2);
      await change(container.querySelector("textarea")!, value);
    } else {
      value = "保存完成前保留的角色名";
      await change(editor(state.content.characters[0].data.name), value);
    }
    await click("保存草稿");
    await waitFor(state.writing);
    expect(editor(value).disabled).toBe(true);
    expect(button("套餐与额度").disabled).toBe(true);
    await act(async () => state.write.resolve());
    await waitFor(state.reloading);
    expect(editor(value).disabled).toBe(true);
    expect(button("套餐与额度").disabled).toBe(true);
    await act(async () => button("套餐与额度").click());
    expect(container.querySelector("h1")!.textContent).toBe(state.title);
    await act(async () => state.reload.resolve());
    await waitFor(() => !button("套餐与额度").disabled);
    if (workspace === "product") expect(editor(value).disabled).toBe(false);
    else if (workspace === "home") expect(state.content.home.pageSize).toBe(21);
    else {
      await click("编辑名字与故事");
      expect(editor(value).disabled).toBe(false);
    }
    expect(container.textContent).not.toContain("有未保存修改");
  }
);

it.each<Workspace>(["product", "home", "character"])(
  "prevents %s publication from clearing edits in a later section",
  async workspace => {
    const state = await mount(workspace, "publish");
    {
      await click(workspace === "product" ? "查看设置变更" : "查看发布变更");
      const confirmation =
        workspace === "product" ? "确认发布设置" : "确认发布全部变更";
      expect(button(confirmation).disabled).toBe(true);
      await act(async () =>
        document
          .querySelector<HTMLInputElement>(
            '[role="dialog"] input[type="checkbox"]'
          )!
          .click()
      );
      await click(confirmation);
    }
    await waitFor(state.writing);
    expect(button("套餐与额度").disabled).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="退出"]')!
        .disabled
    ).toBe(true);
    await act(async () => state.write.resolve());
    await waitFor(state.reloading);
    expect(button("套餐与额度").disabled).toBe(true);
    await act(async () => button("运营链接与页脚").click());
    expect(container.querySelector("h1")!.textContent).toBe(state.title);
    await act(async () => state.reload.resolve());
    await waitFor(() => !button("套餐与额度").disabled);
    await click("套餐与额度");
    await click("运营链接与页脚");
    await click("编辑页脚说明");
    const value = "发布结束后新分区的草稿";
    await change(editor(state.product.config.site.disclosure["zh-CN"]!), value);
    await act(async () => {
      await cache.refetchQueries({
        queryKey: getQueryKey(trpc.productConfig.get),
      });
    });
    expect(editor(value).disabled).toBe(false);
    expect(container.textContent).toContain("有未保存修改");
    expect(window.confirm).not.toHaveBeenCalled();
  }
);

it("searches the shared navigation and closes the mobile drawer after selecting a task", async () => {
  await mount("product", "save");
  await click("返回预览");
  await waitFor(() => !document.querySelector('[role="dialog"]'));
  await click("打开管理导航");
  const drawer = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(drawer.querySelectorAll(".admin-nav-item")).toHaveLength(19);
  expect(drawer.textContent).toContain("视频动作");
  const search = drawer.querySelector<HTMLInputElement>(
    'input[aria-label="查找管理功能"]'
  )!;
  await change(search, "不存在的管理功能");
  expect(drawer.textContent).toContain("没有找到相关功能");
  await change(search, "模型与工作流");
  expect(drawer.querySelectorAll(".admin-nav-item")).toHaveLength(1);
  await act(async () =>
    drawer.querySelector<HTMLButtonElement>(".admin-nav-item")!.click()
  );
  await waitFor(() => !document.querySelector('[role="dialog"]'));
  expect(container.querySelector("h1")!.textContent).toBe("模型与工作流");
});

it("keeps the mobile drawer and unsaved input when navigation is cancelled", async () => {
  const state = await mount("product", "save");
  const value = "取消切换后保留的运营文案";
  await change(editor(state.product.config.site.disclosure["zh-CN"]!), value);
  await click("返回预览");
  await waitFor(() => !document.querySelector('[role="dialog"]'));
  vi.mocked(window.confirm).mockReturnValue(false);
  await click("打开管理导航");
  const drawer = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const target = Array.from(
    drawer.querySelectorAll<HTMLButtonElement>(".admin-nav-item")
  ).find(item => item.textContent === "套餐与额度")!;
  await act(async () => target.click());
  expect(document.querySelector('[role="dialog"]')).toBe(drawer);
  expect(container.querySelector("h1")!.textContent).toBe(state.title);
  expect(container.textContent).toContain(value);
  await act(async () =>
    drawer.querySelector<HTMLButtonElement>(".sheet-close")!.click()
  );
  await waitFor(() => !document.querySelector('[role="dialog"]'));
  await click("编辑页脚说明");
  expect(editor(value).value).toBe(value);
});

it("presents the current experience before fields and keeps local edits when returning from a focused editor", async () => {
  const state = await mount("product", "publish");
  expect(container.querySelectorAll("main input,main textarea")).toHaveLength(
    0
  );
  expect(container.textContent).toContain("当前草稿效果");
  expect(window.location.pathname).toBe("/admin/site");
  await click("编辑页脚说明");
  expect(window.location.search).toContain("edit=footer");
  const value = "预览和编辑共享同一份内容";
  await change(editor(state.product.config.site.disclosure["zh-CN"]!), value);
  await click("返回预览");
  await waitFor(() => !document.querySelector('[role="dialog"]'));
  expect(container.textContent).toContain(value);
  expect(container.querySelectorAll("main input,main textarea")).toHaveLength(
    0
  );
  await click("编辑页脚说明");
  expect(editor(value)).toBeTruthy();
});

it("retains the current input and unlocks navigation after a failed save", async () => {
  const state = await mount("product", "save", "write");
  const value = "失败后仍需保留的输入";
  await change(editor(state.product.config.site.disclosure["zh-CN"]!), value);
  await click("保存草稿");
  await waitFor(state.writing);
  await act(async () => state.write.resolve());
  await waitFor(
    () => container.textContent?.includes("保存失败，请重试") ?? false
  );
  expect(editor(value).disabled).toBe(false);
  expect(container.textContent).toContain("有未保存修改");
  expect(button("套餐与额度").disabled).toBe(false);
  expect(state.reloading()).toBe(false);
});

it("keeps a focused editor open when browser back is used during a pending save", async () => {
  const state = await mount("product", "save");
  const value = "浏览器返回也不能中断正在保存的编辑";
  await change(editor(state.product.config.site.disclosure["zh-CN"]!), value);
  await click("保存草稿");
  await waitFor(state.writing);
  await act(async () => {
    window.history.back();
    await new Promise(resolve => setTimeout(resolve, 30));
  });
  expect(window.location.search).toContain("edit=footer");
  expect(editor(value).disabled).toBe(true);
  await act(async () => {
    state.write.resolve();
    state.reload.resolve();
  });
  await waitFor(() => !button("套餐与额度").disabled);
  expect(editor(value).disabled).toBe(false);
});

it("retains the local draft when saving succeeds but the following reload fails", async () => {
  const state = await mount("product", "save", "reload");
  const value = "草稿重读失败后仍保留的输入";
  await change(editor(state.product.config.site.disclosure["zh-CN"]!), value);
  await click("保存草稿");
  await waitFor(state.writing);
  await act(async () => state.write.resolve());
  await waitFor(state.reloading);
  await act(async () => state.reload.resolve());
  await waitFor(
    () => container.textContent?.includes("草稿重读失败，请重试") ?? false
  );
  expect(editor(value).disabled).toBe(false);
  expect(container.textContent).toContain("有未保存修改");
  expect(button("套餐与额度").disabled).toBe(false);
});

it("creates a clean official draft with only name and personality and previews before saving", async () => {
  const state = await mount("character", "save");
  await click("新增角色");
  await waitFor(() => !!document.querySelector('input[id$="-name"]'));
  expect(field("名字（必填）").value).toBe("");
  expect(field("人物设定（必填）").value).toBe("");
  expect(button("保存草稿").disabled).toBe(true);
  await change(field("名字（必填）"), "最少填写的新角色");
  await change(
    field("人物设定（必填）"),
    "温柔的摄影师，喜欢观察城市，也耐心倾听。带着好奇心与你相处。"
  );
  expect(button("保存草稿").disabled).toBe(false);
  expect(container.querySelector(".character-name")!.textContent).toContain(
    "最少填写的新角色"
  );
  expect(container.querySelector(".character-label")!.textContent).toBe(
    "AI 伙伴"
  );
  await click("返回预览");
  await waitFor(() => !document.querySelector('[role="dialog"]'));
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".character-card")!.click()
  );
  expect(document.querySelector('[role="dialog"]')!.textContent).toContain(
    "草稿预览 · 不会创建角色或开始聊天"
  );
  expect(state.calls).not.toContain("girlfriend.createFromPreset");
  await click("返回编辑");
  await click("保存草稿");
  await act(async () => {
    state.write.resolve();
    state.reload.resolve();
  });
  await waitFor(() => !button("套餐与额度").disabled);
  const created = state.content.characters.find(
    item => item.data.name === "最少填写的新角色"
  )!.data;
  expect(created.appearance).toContain("参考图片");
  expect(created.tagline["zh-CN"]).toBe(created.personality);
  expect(created.label.en).toBeUndefined();
});

it("validates nickname immediately and enables saving once the user corrects it", async () => {
  const state = await mount("character", "save");
  await click("返回预览");
  await waitFor(() => !document.querySelector('[role="dialog"]'));
  await click("编辑相处的细节");
  await click("编辑对用户的称呼");
  await change(field("对用户的称呼"), "称".repeat(41));
  expect(document.body.textContent).toContain("称呼最多 40 字，当前 41 字");
  expect(field("对用户的称呼").getAttribute("aria-invalid")).toBe("true");
  expect(button("保存草稿").disabled).toBe(true);
  expect(state.writing()).toBe(false);
  await change(field("对用户的称呼"), "称".repeat(40));
  expect(document.body.textContent).not.toContain("称呼最多 40 字");
  expect(button("保存草稿").disabled).toBe(false);
});

it("requires review of other roles and homepage changes before any publication request", async () => {
  const state = await mount("character", "publish");
  await click("查看发布变更");
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("另一个角色的待发布介绍");
  expect(dialog.textContent).toContain("每页数量");
  expect(dialog.textContent).toContain("已经创建的用户角色保留原有资料");
  expect(dialog.textContent).toContain("发布前");
  expect(dialog.textContent).toContain("发布后");
  expect(button("确认发布全部变更").disabled).toBe(true);
  expect(state.writing()).toBe(false);
  await click("返回编辑");
  expect(state.calls).not.toContain("discovery.admin.publish");
  expect(container.querySelector("h1")!.textContent).toBe("官方角色");
});

it("returns to the same filtered library after editing a character", async () => {
  const state = await mount("character", "save");
  await click("返回角色库");
  const search = container.querySelector<HTMLInputElement>(
    '[aria-label="搜索官方角色"]'
  )!;
  await change(search, state.content.characters[0].data.name);
  expect(container.textContent).toContain("找到 1 个角色");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        `[aria-label="编辑角色 ${state.content.characters[0].data.name}"]`
      )!
      .click()
  );
  await click("返回角色库");
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="搜索官方角色"]')!
      .value
  ).toBe(state.content.characters[0].data.name);
  await click("已归档");
  expect(container.textContent).toContain("没有找到符合条件的角色");
  expect(state.writing()).toBe(false);
});

it("saves visual featured ordering without altering multilingual homepage copy", async () => {
  const state = await mount("home", "save");
  const previous = structuredClone(state.content.home);
  await click("编排精选");
  const first = state.content.characters.find(
    item => item.id === previous.featuredIds[0]
  )!.data.name;
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(`[aria-label="下移${first}"]`)!
      .click()
  );
  await click("保存草稿");
  await act(async () => {
    state.write.resolve();
    state.reload.resolve();
  });
  await waitFor(() => !button("套餐与额度").disabled);
  expect(state.content.home.featuredIds.slice(0, 2)).toEqual([
    previous.featuredIds[1],
    previous.featuredIds[0],
  ]);
  expect(state.content.home.faqs).toEqual(previous.faqs);
  expect(state.content.home.slides).toEqual(previous.slides);
});

it("validates a new homepage FAQ and preserves existing translations", async () => {
  const state = await mount("home", "save");
  await click("管理问答");
  await click("新增问答");
  expect(document.activeElement).toBe(field("问题6"));
  expect(button("保存草稿").disabled).toBe(true);
  await change(field("问题6"), "新的运营问题？");
  await change(field("回答6"), "这是直接编辑的中文回答。");
  expect(button("保存草稿").disabled).toBe(false);
  await click("预览首页");
  expect(document.querySelector('[role="dialog"]')!.textContent).toContain(
    "新的运营问题？"
  );
  expect(
    document.querySelector<HTMLButtonElement>('[role="dialog"] .hero-primary')!
      .disabled
  ).toBe(true);
  expect(state.writing()).toBe(false);
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        '[role="dialog"] [data-slot="dialog-close"]'
      )!
      .click()
  );
  expect(field("问题6").value).toBe("新的运营问题？");
  await click("保存草稿");
  await act(async () => {
    state.write.resolve();
    state.reload.resolve();
  });
  await waitFor(() => !button("套餐与额度").disabled);
  expect(state.content.home.faqs.at(-1)?.answer["zh-CN"]).toBe(
    "这是直接编辑的中文回答。"
  );
  expect(state.content.home.faqs[0].answer.en).toBe(
    initialDiscovery().home.faqs[0].answer.en
  );
});

it("edits one selected homepage slide without exposing or changing the other slides", async () => {
  const state = await mount("home", "save");
  const original = structuredClone(state.content.home.slides);
  await click("编辑轮播 3");
  expect(window.location.search).toContain(`item=${original[2].id}`);
  expect(document.querySelector('[role="dialog"]')!.textContent).not.toContain(
    "1. " + original[0].title["zh-CN"]
  );
  await change(editor(original[2].title["zh-CN"]!), "第三张轮播的新开场");
  await click("保存草稿");
  await act(async () => {
    state.write.resolve();
    state.reload.resolve();
  });
  await waitFor(() => !button("套餐与额度").disabled);
  expect(state.content.home.slides[0]).toEqual(original[0]);
  expect(state.content.home.slides[1]).toEqual(original[1]);
  expect(state.content.home.slides[2].title["zh-CN"]).toBe(
    "第三张轮播的新开场"
  );
  expect(state.content.home.slides[2].title.en).toBe(original[2].title.en);
});

it("reviews changes from all setting sections without publishing on cancellation", async () => {
  const state = await mount("product", "publish");
  await click("查看设置变更");
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("运营链接与页脚");
  expect(dialog.textContent).toContain("上传与录音");
  expect(button("确认发布设置").disabled).toBe(true);
  await click("返回编辑");
  expect(state.calls).not.toContain("productConfig.admin.publish");
});

it("summarizes content and settings in the publication center", async () => {
  const state = await mount("character", "publish");
  await click("发布中心");
  expect(container.querySelector("h1")!.textContent).toBe("发布中心");
  expect(container.textContent).toContain(
    state.content.characters[1].data.name
  );
  expect(button("核对官方内容变更").disabled).toBe(false);
  expect(button("核对设置变更").disabled).toBe(false);
  await click("核对设置变更");
  expect(document.querySelector('[role="dialog"]')!.textContent).toContain(
    "2 个设置分区待发布"
  );
  expect(state.writing()).toBe(false);
});

it("keeps the selected settings task and plan after saving and reloading its revision", async () => {
  const state = await mount("product", "save");
  await click("套餐与额度");
  await click("复制为新套餐");
  await change(editor("新套餐"), "保存后继续编辑的套餐");
  await change(
    document.querySelector<HTMLInputElement>('[aria-label="金额"]')!,
    "12.34"
  );
  await click("完成套餐编辑");
  await click("编辑订阅与默认");
  await click("保存草稿");
  await act(async () => {
    state.write.resolve();
    state.reload.resolve();
  });
  await waitFor(() => !button("套餐与额度").disabled);
  expect(window.location.search).toContain("edit=subscription");
  expect(container.textContent).toContain("订阅与默认");
  await click("返回体验概览");
  await waitFor(() => !document.querySelector('[role="dialog"]'));
  await click("编辑套餐：保存后继续编辑的套餐");
  expect(editor("保存后继续编辑的套餐")).toBeTruthy();
  expect(
    document.querySelector<HTMLInputElement>('[aria-label="金额"]')!.value
  ).toBe("12.34");
  expect(state.product.config.billing.plans.at(-1)!.label["zh-CN"]).toBe(
    "保存后继续编辑的套餐"
  );
});
it("saves changes from a related editor and the original task in one full draft without publishing", async () => {
  const state = await mount("product", "save");
  await click("记忆规则");
  await click("编辑容量与分类");
  await click("编辑1 级 · 初识");
  await change(
    document.querySelector<HTMLInputElement>('[aria-label="容量"]')!,
    "55"
  );
  await click("返回预览");
  await waitFor(() => !document.querySelector('[role="dialog"]'));
  await click("返回体验概览");
  await waitFor(() => container.textContent!.includes("记忆依赖的等级"));
  const related = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button")
  ).find(item => item.textContent?.startsWith("记忆依赖的等级"))!;
  await act(async () => related.click());
  const dialog = document.querySelector('[role="dialog"]')!;
  const name = Array.from(
    dialog.querySelectorAll<HTMLInputElement>("input")
  ).find(
    item => item.value === state.product.config.intimacy.levels[0].name["zh-CN"]
  )!;
  await change(name, "共同成长的阶段");
  await click("返回预览");
  await waitFor(() => !document.querySelector('[role="dialog"]'));
  await click("保存草稿");
  await act(async () => {
    state.write.resolve();
    state.reload.resolve();
  });
  await waitFor(() => !button("记忆规则").disabled);
  expect(state.product.config.memory.levelRules[0].capacity).toBe(55);
  expect(state.product.config.intimacy.levels[0].name["zh-CN"]).toBe(
    "共同成长的阶段"
  );
  expect(state.product.config.billing).toEqual(productFixture.billing);
  expect(state.product.published).toEqual(productFixture);
  expect(state.calls).not.toContain("productConfig.admin.publish");
  await click("记忆规则");
  await click("编辑容量与分类");
  await click("编辑1 级 · 共同成长的阶段");
  expect(
    document.querySelector<HTMLInputElement>('[aria-label="容量"]')!.value
  ).toBe("55");
});

it("browses prompt documents before editing one and preserves sibling instructions after saving", async () => {
  const state = await mount("product", "save");
  await click("返回预览");
  await waitFor(() => !document.querySelector('[role="dialog"]'));
  await click("提示词模板");
  container.setAttribute("data-management-scroll", "");
  vi.mocked(HTMLElement.prototype.scrollTo).mockClear();
  await click("编辑表达与关系");
  expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith({
    top: 0,
    behavior: "instant",
  });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelectorAll("textarea")).toHaveLength(0);
  const original = structuredClone(state.product.config.prompts.chat);
  await click("编辑表达方式 · 温柔体贴");
  expect(document.querySelectorAll('[role="dialog"] textarea')).toHaveLength(1);
  const changed = "认真倾听，温柔地回应具体的事情。";
  await change(
    document.querySelector<HTMLTextAreaElement>('[role="dialog"] textarea')!,
    changed
  );
  await click("返回预览");
  await waitFor(() => !document.querySelector('[role="dialog"]'));
  expect(container.textContent).toContain(changed);
  await click("编辑表达方式 · 温柔体贴");
  expect(
    document.querySelector<HTMLTextAreaElement>('[role="dialog"] textarea')!
      .value
  ).toBe(changed);
  await click("保存草稿");
  await act(async () => {
    state.write.resolve();
    state.reload.resolve();
  });
  await waitFor(() => !button("提示词模板").disabled);
  expect(state.product.config.prompts.chat).toEqual({
    ...original,
    expression: { ...original.expression, warm: changed },
  });
  expect(state.product.published).toEqual(productFixture);
  expect(window.location.search).toContain("item=chat.expression.warm");
  expect(document.querySelectorAll('[role="dialog"] textarea')).toHaveLength(1);
});

it("keeps homepage arrangement free of copy fields and opens only the selected FAQ", async () => {
  const state = await mount("home", "save");
  await click("管理问答");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelectorAll("input,textarea,select")).toHaveLength(1); // 导航搜索
  await click("下移问答1");
  await click("编辑问答2");
  expect(document.querySelectorAll('[role="dialog"] input')).toHaveLength(1);
  expect(document.querySelectorAll('[role="dialog"] textarea')).toHaveLength(1);
  await change(field("回答2"), "单条内容更新");
  await click("保存草稿");
  await act(async () => {
    state.write.resolve();
    state.reload.resolve();
  });
  await waitFor(() => !button("套餐与额度").disabled);
  expect(state.content.home.faqs[1].id).toBe(
    initialDiscovery().home.faqs[0].id
  );
  expect(state.content.home.faqs[1].answer["zh-CN"]).toBe("单条内容更新");
  expect(state.content.home.faqs[0]).toEqual(initialDiscovery().home.faqs[1]);
  expect(state.content.home.faqs[1].answer.en).toBe(
    initialDiscovery().home.faqs[0].answer.en
  );
});

it("opens a theme as an appearance preview and saves only its selected copy task", async () => {
  const state = await mount("product", "save");
  await click("返回预览");
  await waitFor(() => !document.querySelector('[role="dialog"]'));
  await click("主题配色");
  const theme = structuredClone(state.product.config.themes.items[0]);
  await click(`编辑主题 ${theme.name["zh-CN"]}`);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('[aria-label="主题明暗预览"]')).not.toBeNull();
  await click("编辑名称与开放状态");
  expect(document.querySelector('[role="dialog"] [role="tablist"]')).toBeNull();
  await change(editor(theme.name["zh-CN"]!), "本轮的主题名称");
  await click("保存草稿");
  await act(async () => {
    state.write.resolve();
    state.reload.resolve();
  });
  await waitFor(() => !button("主题配色").disabled);
  expect(state.product.config.themes.items[0]).toEqual({
    ...theme,
    name: { ...theme.name, "zh-CN": "本轮的主题名称" },
  });
  expect(state.product.config.themes.items.slice(1)).toEqual(
    productFixture.themes.items.slice(1)
  );
  expect(window.location.search).toContain("part=copy");
  expect(editor("本轮的主题名称")).toBeTruthy();
});

it("keeps the default playback speed available while editing allowed choices", async () => {
  const state = await mount("product", "save");
  await click("返回预览");
  await waitFor(() => !document.querySelector('[role="dialog"]'));
  await click("分页、播放与连接");
  await click("编辑朗读体验");
  await click("编辑用户可选什么倍速");
  expect(button("允许 1 倍").disabled).toBe(true);
  const defaults = document.querySelector(
    '[role="group"][aria-label="默认倍速"]'
  )!;
  await act(async () =>
    Array.from(defaults.querySelectorAll("button"))
      .find(item => item.textContent === "1.25×")!
      .click()
  );
  await click("允许 1 倍");
  await change(
    document.querySelector<HTMLInputElement>('[aria-label="自定义倍速"]')!,
    "1.75"
  );
  await click("添加");
  await click("保存草稿");
  await act(async () => {
    state.write.resolve();
    state.reload.resolve();
  });
  await waitFor(() => !button("分页、播放与连接").disabled);
  const playback = state.product.config.experience.playback;
  expect(playback.speeds).toContain(playback.defaultSpeed);
  expect(playback.defaultSpeed).toBe(1.25);
  expect(playback.speeds).not.toContain(1);
  expect(playback.speeds).toContain(1.75);
  expect(playback.defaultProvider).toBe(
    productFixture.experience.playback.defaultProvider
  );
});

it.each<Workspace>(["product", "home", "character"])(
  "shows %s as synchronized when saved content equals publication despite a newer revision",
  async workspace => {
    await mount(workspace, "save");
    await waitFor(
      () =>
        container.querySelector(".admin-draft-badge")?.textContent === "已发布"
    );
    expect(container.querySelector(".admin-draft-badge")?.textContent).toBe(
      "已发布"
    );
    expect(container.textContent).not.toContain("草稿待发布");
  }
);

it("clears pending publication after an edited draft is saved back to the public content", async () => {
  const state = await mount("product", "save");
  const original = state.product.config.site.disclosure["zh-CN"]!;
  await change(editor(original), `${original} · 待确认文案`);
  await click("保存草稿");
  await act(async () => {
    state.write.resolve();
    state.reload.resolve();
  });
  await waitFor(() => !button("运营链接与页脚").disabled);
  expect(container.querySelector(".admin-draft-badge")?.textContent).toBe(
    "草稿待发布"
  );
  await change(editor(`${original} · 待确认文案`), original);
  await click("保存草稿");
  await waitFor(
    () =>
      state.product.config.site.disclosure["zh-CN"] === original &&
      !button("运营链接与页脚").disabled
  );
  expect(state.product.revision).toBeGreaterThan(
    state.product.publishedRevision
  );
  expect(container.querySelector(".admin-draft-badge")?.textContent).toBe(
    "已发布"
  );
  await click("返回预览");
  await waitFor(() => !document.querySelector('[role="dialog"]'));
  expect(container.textContent).not.toContain("草稿待发布");
  expect(container.textContent).not.toContain("查看设置变更");
  expect(state.calls).not.toContain("productConfig.admin.publish");
});
