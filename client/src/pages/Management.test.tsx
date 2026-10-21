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
  HTMLElement.prototype.scrollTo = vi.fn();
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
    container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input,textarea"
    )
  ).find(item => item.value === value);
  expect(result).toBeTruthy();
  return result!;
}
function field(label: string) {
  const element = Array.from(container.querySelectorAll("label")).find(
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
    await waitFor(() => !!container.querySelector('input[id$="-name"]'));
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
    await change(container.querySelector("#management-section")!, "billing");
    expect(container.querySelector("h1")!.textContent).toBe(state.title);
    await act(async () => state.reload.resolve());
    await waitFor(() => !button("套餐与额度").disabled);
    if (workspace === "product") expect(editor(value).disabled).toBe(false);
    else if (workspace === "home") expect(state.content.home.pageSize).toBe(21);
    else expect(editor(value).disabled).toBe(false);
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
    await change(container.querySelector("#management-section")!, "site");
    expect(container.querySelector("h1")!.textContent).toBe(state.title);
    await act(async () => state.reload.resolve());
    await waitFor(() => !button("套餐与额度").disabled);
    await click("套餐与额度");
    await click("运营链接与页脚");
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
  await change(field("对用户的称呼"), "称".repeat(41));
  expect(container.textContent).toContain("称呼最多 40 字，当前 41 字");
  expect(field("对用户的称呼").getAttribute("aria-invalid")).toBe("true");
  expect(button("保存草稿").disabled).toBe(true);
  expect(state.writing()).toBe(false);
  await change(field("对用户的称呼"), "称".repeat(40));
  expect(container.textContent).not.toContain("称呼最多 40 字");
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
  const first = state.content.characters.find(
    item => item.id === previous.featuredIds[0]
  )!.data.name;
  await act(async () =>
    container
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
  await click(`常见问题 (${state.content.home.faqs.length})`);
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
