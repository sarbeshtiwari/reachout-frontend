import { useSyncExternalStore } from "react";

// Tiny global stores (toasts, modals) usable from any module without prop drilling.
export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set: next => { state = typeof next === "function" ? next(state) : next; subs.forEach(f => f()); },
    subscribe: f => { subs.add(f); return () => subs.delete(f); },
  };
}
export const useStore = store => useSyncExternalStore(store.subscribe, store.get);

// Cross-page events ("applications changed", "replies changed", "mail sync finished").
const listeners = {};
export const on = (name, fn) => { (listeners[name] ||= new Set()).add(fn); return () => listeners[name].delete(fn); };
export const emit = (name, data) => listeners[name]?.forEach(fn => fn(data));
