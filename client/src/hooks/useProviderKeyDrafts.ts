/** 密钥只留在当前账号的内存中；部分保存失败或保存期间的新输入不会被清除。 */
import { useEffect, useRef, useState } from "react";
import { KEY_NAMES, type KeyName } from "@shared/providerKeys";
import { formDraftEpoch } from "@/lib/formDrafts";

type KeyInput = { name: KeyName; value: string };
export type KeySaveResult = {
  saved: KeyName[];
  failed: { name: KeyName; error: unknown }[];
  interrupted?: boolean;
};
const emptyDrafts = () =>
  Object.fromEntries(KEY_NAMES.map(name => [name, ""])) as Record<
    KeyName,
    string
  >;

export function useProviderKeyDrafts(
  saveOne: (input: KeyInput) => Promise<unknown>,
  accountId?: string
) {
  const [drafts, setDrafts] = useState(emptyDrafts);
  const current = useRef(drafts);
  const [isSaving, setIsSaving] = useState(false);
  const inFlight = useRef<Promise<KeySaveResult> | null>(null);
  const owner = useRef({ accountId, epoch: formDraftEpoch() });
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  if (
    owner.current.accountId !== accountId ||
    owner.current.epoch !== formDraftEpoch()
  ) {
    owner.current = { accountId, epoch: formDraftEpoch() };
    current.current = emptyDrafts();
    inFlight.current = null;
    setDrafts(current.current);
    setIsSaving(false);
  }
  const scope = owner.current;
  const isCurrent = () =>
    mounted.current &&
    owner.current === scope &&
    scope.epoch === formDraftEpoch();
  const setDraft = (name: KeyName, value: string) => {
    if (!isCurrent()) return;
    current.current = { ...current.current, [name]: value };
    setDrafts(current.current);
  };
  const snapshotDrafts = (names: readonly KeyName[] = KEY_NAMES): KeyInput[] =>
    names
      .filter(name => current.current[name])
      .map(name => ({ name, value: current.current[name] }));

  const saveDrafts = (
    names: readonly KeyName[] = KEY_NAMES,
    snapshot = snapshotDrafts(names)
  ): Promise<KeySaveResult> => {
    if (!isCurrent())
      return Promise.resolve({ saved: [], failed: [], interrupted: true });
    if (inFlight.current) return inFlight.current;
    setIsSaving(true);
    const task = (async () => {
      const result: KeySaveResult = { saved: [], failed: [] };
      for (const input of snapshot) {
        if (!isCurrent()) {
          result.interrupted = true;
          break;
        }
        try {
          await saveOne(input);
          result.saved.push(input.name);
        } catch (error) {
          result.failed.push({ name: input.name, error });
        }
      }
      if (isCurrent()) {
        const next = { ...current.current };
        for (const { name, value } of snapshot)
          if (result.saved.includes(name) && next[name] === value)
            next[name] = "";
        current.current = next;
        setDrafts(next);
      } else result.interrupted = true;
      return result;
    })();
    const settled = task.finally(() => {
      if (inFlight.current !== settled) return;
      inFlight.current = null;
      if (isCurrent()) setIsSaving(false);
    });
    inFlight.current = settled;
    return settled;
  };
  return { drafts, setDraft, snapshotDrafts, saveDrafts, isSaving };
}
