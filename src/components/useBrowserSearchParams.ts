"use client";

import { useEffect, useState } from "react";

/**
 * Static HTML export cannot resolve `useSearchParams()` — it suspends forever
 * and `/playground/` stays on its Suspense fallback. Read the real URL after
 * mount, and keep it in sync with history push/replace.
 */
const listeners = new Set<() => void>();
let patched = false;

function emit() {
  for (const listener of listeners) listener();
}

function ensurePatched() {
  if (patched || typeof window === "undefined") return;
  patched = true;
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  history.pushState = (...args: Parameters<History["pushState"]>) => {
    push(...args);
    emit();
  };
  history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    replace(...args);
    emit();
  };
  window.addEventListener("popstate", emit);
}

export function useBrowserSearchParams() {
  const [search, setSearch] = useState("");
  useEffect(() => {
    ensurePatched();
    const onChange = () => setSearch(window.location.search);
    onChange();
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);
  return new URLSearchParams(search);
}
