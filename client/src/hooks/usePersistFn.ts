/** 提供函数引用稳定、执行时使用最新闭包的回调包装。 */

import { useRef } from "react";

/** 可保留参数与返回值类型的函数签名约束。 */
type noop = (...args: any[]) => any;

/** 返回引用稳定的函数，调用时转发到最新传入回调，并保留 this 与参数。 */
export function usePersistFn<T extends noop>(fn: T) {
  const fnRef = useRef<T>(fn);
  fnRef.current = fn;

  const persistFn = useRef<T>(null);
  if (!persistFn.current) {
    persistFn.current = function (this: unknown, ...args) {
      return fnRef.current!.apply(this, args);
    } as T;
  }

  return persistFn.current!;
}
