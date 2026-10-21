/** 管理内容与编辑地址能稳定恢复，特殊标识不会改变路径结构。 */
import { expect, it } from "vitest";
import { managementRoute, managementPath } from "./managementRoutes";

it("restores each management module and official character from its address", () => {
  expect(managementRoute("/admin")).toEqual({
    pane: "overview",
    characterId: "",
  });
  expect(managementRoute("/admin/memory")).toEqual({
    pane: "memory",
    characterId: "",
  });
  expect(managementRoute(managementPath("official", "copy:xiaotao"))).toEqual({
    pane: "official",
    characterId: "copy:xiaotao",
  });
  expect(managementPath("official", "a/b")).toBe("/admin/official/a%2Fb");
  expect(managementRoute("/admin/unknown").pane).toBe("overview");
  expect(managementRoute("/admin/official/%bad").characterId).toBe("");
});
