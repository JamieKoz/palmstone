"use client";

import { useEffect, useLayoutEffect, useState } from "react";

const STORAGE_KEY = "palmstone:pageRevealWipe";
const REVEAL_MS = 500;

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
  // Reset module cache so the next mount can re-arm from storage
  cachedReveal = undefined;
}

/** Survives React Strict Mode remounts (effect cleanup must not lose the wipe). */
let cachedReveal: { accent: string | null } | null | undefined;

function peekReveal(): { accent: string | null } | null {
  if (typeof window === "undefined") return null;
  if (cachedReveal !== undefined) return cachedReveal;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cachedReveal = null;
      return null;
    }
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as { accent?: string | null };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cachedReveal = null;
      return null;
    }
    cachedReveal = {
      accent: typeof parsed.accent === "string" ? parsed.accent : null,
    };
    return cachedReveal;
  } catch {
    cachedReveal = null;
    return null;
  }
}

function clearRevealCache() {
  cachedReveal = undefined;
}

/**
 * Centered circle: starts full-screen, shrinks to 0 to reveal the page.
 * Used when returning from an experience.
 */
export function PageRevealWipe() {
  const [wipe, setWipe] = useState<{ accent: string | null } | null>(null);

  useLayoutEffect(() => {
    const next = peekReveal();
    if (!next) return;
    const frame = requestAnimationFrame(() => setWipe(next));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!wipe) return;
    const end = window.setTimeout(() => {
      setWipe(null);
      clearRevealCache();
    }, REVEAL_MS);
    return () => window.clearTimeout(end);
  }, [wipe]);

  if (!wipe) return null;

  return (
    <div
      className="circle-wipe circle-wipe--reveal"
      style={{
        ["--enter-accent" as string]: wipe.accent ?? "var(--ink)",
      }}
      aria-hidden
    >
      <div className="circle-wipe__blob" />
    </div>
  );
}
