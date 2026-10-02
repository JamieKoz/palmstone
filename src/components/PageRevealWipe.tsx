"use client";

import { useEffect, useLayoutEffect, useState } from "react";

const STORAGE_KEY = "palmstone:pageRevealWipe";
const REVEAL_MS = 500;

/**
 * Peak of `circle-wipe-in` (42%): the blob is at scale(1.35) and covers the
 * viewport. Navigation must wait until then so the destination cannot show
 * around a still-growing circle. Keep in sync with the keyframe in globals.css.
 */
const COVER_FRACTION = 0.42;

type AppRouter = { push: (href: string) => void };

let coverWipe: { root: HTMLElement } | null = null;

export function isCoverWipeRunning() {
  return coverWipe != null;
}

function wipeAnimation(blob: HTMLElement) {
  return blob.getAnimations().find(
    (item): item is CSSAnimation =>
      item instanceof CSSAnimation && item.animationName === "circle-wipe-in",
  );
}

function blobCoversViewport(blob: HTMLElement) {
  const rect = blob.getBoundingClientRect();
  const radius = Math.min(rect.width, rect.height) / 2;
  if (radius <= 1) return false;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const width = window.innerWidth;
  const height = window.innerHeight;
  return [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ].every(([x, y]) => Math.hypot(x - cx, y - cy) <= radius + 1);
}

/**
 * Expand the circle over the current page. Once it covers the screen, pause
 * and navigate. The destination calls `resumeCoverWipe` so the same circle
 * shrinks and reveals the new page only after it is fully covered.
 */
export function navigateWithCoverWipe(router: AppRouter, href: string, accent?: string) {
  if (typeof window === "undefined") return;
  if (coverWipe) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    router.push(href);
    return;
  }

  const root = document.createElement("div");
  root.className = "circle-wipe circle-wipe--enter circle-wipe--screen";
  root.setAttribute("aria-hidden", "true");
  if (accent) root.style.setProperty("--enter-accent", accent);
  const blob = document.createElement("div");
  blob.className = "circle-wipe__blob";
  root.append(blob);
  document.body.append(root);
  coverWipe = { root };

  let navigated = false;
  let stopped = false;
  let poll = 0;
  let hardStop = 0;

  const remove = () => {
    if (coverWipe?.root !== root) return;
    coverWipe = null;
    stopped = true;
    window.clearInterval(poll);
    window.clearTimeout(hardStop);
    root.remove();
  };

  const go = () => {
    if (navigated) return;
    navigated = true;
    router.push(href);
  };

  blob.addEventListener("animationend", remove);

  let frames = 0;
  const attempt = () => {
    if (stopped || !coverWipe || coverWipe.root !== root) return;
    const anim = wipeAnimation(blob);
    frames += 1;
    if (!anim) {
      if (frames > 45) {
        remove();
        go();
      }
      return;
    }
    const duration = Number(anim.effect?.getComputedTiming().duration);
    const total = Number.isFinite(duration) && duration > 0 ? duration : 1100;
    const peak = total * COVER_FRACTION;
    const time = Number(anim.currentTime);
    const covered = time > 32 && blobCoversViewport(blob);
    if (covered || time >= peak) {
      stopped = true;
      window.clearInterval(poll);
      anim.pause();
      anim.currentTime = Math.min(Number.isFinite(time) ? time : peak, peak);
      go();
    }
  };

  poll = window.setInterval(attempt, 16);
  const loop = () => {
    if (stopped) return;
    attempt();
    if (!stopped) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // If frames stall, hold the blob at full cover and navigate under it.
  hardStop = window.setTimeout(() => {
    if (navigated || coverWipe?.root !== root) return;
    const anim = wipeAnimation(blob);
    if (anim) {
      const duration = Number(anim.effect?.getComputedTiming().duration);
      const total = Number.isFinite(duration) && duration > 0 ? duration : 1100;
      anim.pause();
      anim.currentTime = total * COVER_FRACTION;
    }
    stopped = true;
    window.clearInterval(poll);
    go();
  }, 1600);

  // Last resort: never leave a full-screen layer swallowing clicks.
  window.setTimeout(remove, 2800);
}

/** Continue the shrink half after the destination has committed. */
export function resumeCoverWipe() {
  const root = coverWipe?.root;
  if (!root) return;
  const blob = root.querySelector(".circle-wipe__blob");
  if (!(blob instanceof HTMLElement)) return;
  const anim = wipeAnimation(blob);
  if (anim && anim.playState === "paused") anim.play();
  const duration = Number(anim?.effect?.getComputedTiming().duration);
  const total = Number.isFinite(duration) && duration > 0 ? duration : 1100;
  const time = Number(anim?.currentTime);
  const left = Math.max(0, total - (Number.isFinite(time) ? time : 0));
  window.setTimeout(() => {
    if (coverWipe?.root !== root) return;
    coverWipe = null;
    root.remove();
  }, left + 80);
}

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
    resumeCoverWipe();
    const next = peekReveal();
    if (next) setWipe(next);
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
