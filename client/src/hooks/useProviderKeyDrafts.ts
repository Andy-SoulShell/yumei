/** 保存 Provider 密钥草稿，部分失败和保存期间新输入的内容继续保留。 */
import { useRef, useState } from "react";
import { KEY_NAMES, type KeyName } from "@shared/providerKeys";

/** 批量保存的逐项结果，不返回明文。 */
export type KeySaveResult = {
  saved: KeyName[];
  failed: { name: KeyName; error: unknown }[];
};

/** 管理草稿快照；只清理成功且未被用户再次编辑的字段。 */
export function useProviderKeyDrafts(
  saveOne: (input: { name: KeyName; value: string }) => Promise<unknown>
) {
  const [drafts, setDrafts] = useState<Record<KeyName, string>>({
    openrouter: "",
    fal: "",
    elevenlabs: "",
    "fish-audio": "",
    openai: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const inFlight = useRef<Promise<KeySaveResult> | null>(null);

  const setDraft = (name: KeyName, value: string) =>
    setDrafts(previous => ({ ...previous, [name]: value }));

  const saveDrafts = (
    names: readonly KeyName[] = KEY_NAMES
  ): Promise<KeySaveResult> => {
    if (inFlight.current) return inFlight.current;
    const snapshot = names
      .filter(name => drafts[name])
      .map(name => ({ name, value: drafts[name] }));
    setIsSaving(true);
    const task = (async () => {
      const result: KeySaveResult = { saved: [], failed: [] };
      for (const input of snapshot) {
        try {
          await saveOne(input);
          result.saved.push(input.name);
        } catch (error) {
          result.failed.push({ name: input.name, error });
        }
      }
      setDrafts(previous => {
        const next = { ...previous };
        for (const { name, value } of snapshot) {
          if (result.saved.includes(name) && previous[name] === value)
            next[name] = "";
        }
        return next;
      });
      return result;
    })();
    inFlight.current = task;
    return task.finally(() => {
      inFlight.current = null;
      setIsSaving(false);
    });
  };
  return { drafts, setDraft, saveDrafts, isSaving };
}
