"use client";

import { useEffect } from "react";
import { getSharedAudio } from "@/engine/audio";
import { getMuted, getMusicMuted } from "@/engine/storage";

/** Unlock AudioContext + start peaceful ambient on first user gesture. */
export function SiteAudio() {
  useEffect(() => {
    const audio = getSharedAudio();
    audio.setMuted(getMuted());
    audio.setMusicMuted(getMusicMuted());

    const unlock = () => {
      void (async () => {
        await audio.resume();
        await audio.unlockAndStartPeace();
      })();
    };

    // Capture phase so we unlock even if a child stops propagation later
    window.addEventListener("pointerdown", unlock, { once: true, capture: true });
    window.addEventListener("keydown", unlock, { once: true, capture: true });
    window.addEventListener("touchstart", unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      window.removeEventListener("touchstart", unlock, true);
    };
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let pressed: Element | null = null;
    const press = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const el = target.closest("button, a[href]");
      if (!el || el.classList.contains("folder-sheet__backdrop")) return;
      pressed?.classList.remove("is-pressed");
      pressed = el;
      el.classList.add("is-pressed");
    };
    const release = () => {
      pressed?.classList.remove("is-pressed");
      pressed = null;
    };
    document.addEventListener("pointerdown", press);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      document.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);

  return null;
}

/** Soft playful UI click + ensure ambient is running. */
export function playUiClick() {
  const audio = getSharedAudio();
  void (async () => {
    await audio.resume();
    await audio.unlockAndStartPeace();
    audio.uiSoft();
  })();
}

export function onExperienceNavClick() {
  playUiClick();
}
