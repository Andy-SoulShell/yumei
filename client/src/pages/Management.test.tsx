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
  const result = Array.from(container.querySelectorAll("button")).find(
    item => item.textContent?.trim() === text
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
    revision: 2,
    publishedRevision: 1,
    publishedAt: new Date(),
  };
  const seed = initialDiscovery();
  const content = {
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
  const target =
    workspace === "product" ? "productConfig.admin" : "discovery.admin";
  const procedure = `${target}.${action === "publish" ? "publish" : workspace === "product" ? "save" : workspace === "home" ? "saveHomepage" : "saveCharacter"}`;
  let writing = false,
    reloading = false,
    reads = 0;
  const client = trpc.createClient({
    links: [
      () =>
        ({ op }) =>
          observable(observer => {
            void (async () => {
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
                  else content.characters[0].data = input.character;
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
  return {
    write,
    reload,
    product,
    content,
    title,
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
    await click("发布");
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
