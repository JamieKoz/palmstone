import type { HapticsBus } from "./types";

export function createHapticsBus(initialEnabled = true): HapticsBus {
  let enabled = initialEnabled;

  function supported() {
    return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  }

  return {
    setEnabled(v: boolean) {
      enabled = v;
    },
    isEnabled() {
      return enabled;
    },
    tap(ms = 12) {
      if (!enabled || !supported()) return;
      try {
        navigator.vibrate(ms);
      } catch {
        /* no-op */
      }
    },
    pattern(pattern: number[]) {
      if (!enabled || !supported()) return;
      try {
        navigator.vibrate(pattern);
      } catch {
        /* no-op */
      }
    },
  };
}
