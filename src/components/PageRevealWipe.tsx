"use client";

import { useLayoutEffect, useState } from "react";

const STORAGE_KEY = "palmstone:pageRevealWipe";

/** Arm a centered full→0 reveal wipe on the next page (playground). */
export function armPageRevealWipe(accent?: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ accent: accent ?? null }),
    );
  } catch {
    /* */
  }
}

/**
 * Centered circle: starts full-screen, shrinks to 0 to reveal the page.
 * Used when returning from an experience.
 */
export function PageRevealWipe() {
  const [accent, setAccent] = useState<string | null>(null);
  const [active, setActive] = useState(false);

  useLayoutEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      sessionStorage.removeItem(STORAGE_KEY);
      const parsed = JSON.parse(raw) as { accent?: string | null };
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return;
      setAccent(typeof parsed.accent === "string" ? parsed.accent : null);
      setActive(true);
      const t = window.setTimeout(() => setActive(false), 250);
      return () => window.clearTimeout(t);
    } catch {
      /* */
    }
  }, []);

  if (!active) return null;

  return (
    <div
      className="circle-wipe circle-wipe--reveal"
      style={{
        ["--enter-accent" as string]: accent ?? "var(--ink)",
      }}
      aria-hidden
    >
      <div className="circle-wipe__blob" />
    </div>
  );
}
