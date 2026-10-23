import {
  formDraftEpoch,
  readFormDraft,
  writeFormDraft,
  removeFormDraft,
} from "@/lib/formDrafts";
/** 按字段隔离设置草稿与服务端快照，刷新和请求期间的继续编辑不会丢失。 */
import { useEffect, useRef, useState } from "react";

export function useSettingsDraft<T extends Record<string, unknown>>(
  initial: T,
  remote: T | undefined,
  storageKey: string | null = null
) {
  const restore = () => {
    const restored = readFormDraft(storageKey);
    const next = { ...initial };
    const keys = new Set<keyof T>();
    for (const key of Object.keys(initial) as (keyof T)[]) {
      const candidate = restored?.[String(key)];
      if (
        typeof initial[key] === "string" &&
        typeof candidate === "string" &&
        candidate.length <= 32000
      ) {
        next[key] = candidate as T[keyof T];
        keys.add(key);
      }
    }
    return { value: next, keys };
  };
  const [seed] = useState(restore);
  const [value, setValue] = useState(seed.value);
  const current = useRef(seed.value);
  const baseline = useRef(initial);
  const dirty = useRef(seed.keys);
  const owner = useRef(storageKey);
  const mounted = useRef(true);
  const epoch = useRef(formDraftEpoch());
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  if (owner.current !== storageKey) {
    const restored = restore();
    owner.current = storageKey;
    epoch.current = formDraftEpoch();
    current.current = restored.value;
    baseline.current = initial;
    dirty.current = restored.keys;
    setValue(restored.value);
  }
  const persist = () => {
    if (
      !mounted.current ||
      owner.current !== storageKey ||
      epoch.current !== formDraftEpoch()
    )
      return;
    const patch: Partial<T> = {};
    for (const key of Array.from(dirty.current))
      patch[key] = current.current[key];
    if (Object.keys(patch).length) writeFormDraft(storageKey, patch);
    else removeFormDraft(storageKey);
  };
  useEffect(() => {
    if (!remote || epoch.current !== formDraftEpoch()) return;
    const next = { ...current.current };
    for (const key of Object.keys(remote) as (keyof T)[]) {
      if (!dirty.current.has(key) || Object.is(next[key], remote[key])) {
        next[key] = remote[key];
        dirty.current.delete(key);
      }
    }
    baseline.current = remote;
    current.current = next;
    setValue(next);
    const patch: Partial<T> = {};
    for (const key of Array.from(dirty.current)) patch[key] = next[key];
    if (Object.keys(patch).length) writeFormDraft(storageKey, patch);
    else removeFormDraft(storageKey);
  }, [remote, storageKey]);

  const field = <K extends keyof T>(key: K): [T[K], (value: T[K]) => void] => [
    value[key],
    next => {
      current.current = { ...current.current, [key]: next };
      if (Object.is(next, baseline.current[key])) dirty.current.delete(key);
      else dirty.current.add(key);
      persist();
      setValue(current.current);
    },
  ];

  /** 仅确认本次提交且此后未再次编辑的字段，保留后续版本的未保存提示。 */
  const acknowledge = (keys: (keyof T)[], submitted: T) => {
    if (
      !mounted.current ||
      owner.current !== storageKey ||
      epoch.current !== formDraftEpoch()
    )
      return;
    for (const key of keys) {
      baseline.current = { ...baseline.current, [key]: submitted[key] };
      if (Object.is(current.current[key], submitted[key]))
        dirty.current.delete(key);
    }
    persist();
    setValue({ ...current.current });
  };
  return {
    value,
    field,
    acknowledge,
    isDirty: (keys: (keyof T)[]) => keys.some(key => dirty.current.has(key)),
  };
}
