/** 普通表单草稿仅保留在当前标签页，按账号和表单隔离；文件只在内存中保留。 */
const PREFIX = "yumei:form-draft:v1:";
let epoch = 0;
export const formDraftEpoch = () => epoch;
const memory = new Map<string, string>();
const files = new Map<string, { reference?: File; avatar?: File }>();
export function formDraftKey(accountId: string | undefined, form: string) {
  return accountId
    ? `${PREFIX}${encodeURIComponent(accountId)}:${encodeURIComponent(form)}`
    : null;
}
export function readFormDraft(
  key: string | null
): Record<string, unknown> | null {
  if (!key) return null;
  let raw: string | null | undefined = memory.get(key);
  if (raw === undefined)
    try {
      raw = sessionStorage.getItem(key);
    } catch {
      /* 受限存储时使用本标签页内存。 */
    }
  if (!raw || raw.length > 128000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
export function writeFormDraft(key: string | null, value: object) {
  if (!key) return;
  const raw = JSON.stringify(value);
  if (raw.length > 128000) return;
  memory.set(key, raw);
  try {
    sessionStorage.setItem(key, raw);
  } catch {
    /* 继续保留内存草稿。 */
  }
}
export function removeFormDraft(key: string | null) {
  if (!key) return;
  memory.delete(key);
  try {
    sessionStorage.removeItem(key);
  } catch {
    memory.set(key, ""); // 不让无法移除的旧存储在当前标签页复活。
  }
}
export function readDraftFile(
  key: string | null,
  kind: "reference" | "avatar"
) {
  return key ? (files.get(key)?.[kind] ?? null) : null;
}
export function writeDraftFile(
  key: string | null,
  kind: "reference" | "avatar",
  file: File | null
) {
  if (!key) return;
  const next = { ...files.get(key) };
  if (file) next[kind] = file;
  else delete next[kind];
  if (next.reference || next.avatar) files.set(key, next);
  else files.delete(key);
}
export function clearFormDrafts() {
  epoch++;
  memory.clear();
  files.clear();
  try {
    const keys = Array.from({ length: sessionStorage.length }, (_, index) =>
      sessionStorage.key(index)
    );
    for (const key of keys)
      if (key?.startsWith(PREFIX)) sessionStorage.removeItem(key);
  } catch {
    /* 退出不受浏览器存储策略阻断。 */
  }
}
