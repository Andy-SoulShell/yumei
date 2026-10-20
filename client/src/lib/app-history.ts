/** 标记站内历史，返回按钮在直接进入页面时使用安全的站内落点。 */
const INDEX = "yumei:history-index";
const readIndex = () => {
  const value = window.history.state?.[INDEX];
  return Number.isInteger(value) && value >= 0 ? (value as number) : 0;
};
export function hasAppBackEntry() {
  return readIndex() > 0 && window.history.length > 1;
}

/** 复用 wouter 的 History 事件；replace 不会增加站内返回层级。 */
export function trackAppHistory() {
  let index = readIndex();
  let writing = false;
  const stamp = () => {
    if (window.history.state?.[INDEX] === index) return;
    writing = true;
    const state = window.history.state;
    window.history.replaceState(
      { ...(state && typeof state === "object" ? state : {}), [INDEX]: index },
      ""
    );
    writing = false;
  };
  const push = () => {
    if (!writing) {
      index += 1;
      stamp();
    }
  };
  const replace = () => {
    if (!writing) stamp();
  };
  const pop = () => {
    index = readIndex();
    stamp();
  };
  stamp();
  window.addEventListener("pushState", push);
  window.addEventListener("replaceState", replace);
  window.addEventListener("popstate", pop);
  return () => {
    window.removeEventListener("pushState", push);
    window.removeEventListener("replaceState", replace);
    window.removeEventListener("popstate", pop);
  };
}
