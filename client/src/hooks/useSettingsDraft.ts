/** 按字段隔离设置草稿与服务端快照，刷新和请求期间的继续编辑不会丢失。 */
import { useEffect, useRef, useState } from "react";

export function useSettingsDraft<T extends Record<string, unknown>>(
  initial: T,
  remote: T | undefined
) {
  const [value, setValue] = useState(initial);
  const current = useRef(initial);
  const baseline = useRef(initial);
  const dirty = useRef(new Set<keyof T>());
  useEffect(() => {
    if (!remote) return;
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
  }, [remote]);

  const field = <K extends keyof T>(key: K): [T[K], (value: T[K]) => void] => [
    value[key],
    next => {
      current.current = { ...current.current, [key]: next };
      if (Object.is(next, baseline.current[key])) dirty.current.delete(key);
      else dirty.current.add(key);
      setValue(current.current);
    },
  ];

  /** 仅确认本次提交且此后未再次编辑的字段，保留后续版本的未保存提示。 */
  const acknowledge = (keys: (keyof T)[], submitted: T) => {
    for (const key of keys) {
      baseline.current = { ...baseline.current, [key]: submitted[key] };
      if (Object.is(current.current[key], submitted[key]))
        dirty.current.delete(key);
    }
    setValue({ ...current.current });
  };
  return {
    value,
    field,
    acknowledge,
    isDirty: (keys: (keyof T)[]) => keys.some(key => dirty.current.has(key)),
  };
}
