"use client";

import { useEffect } from "react";
import { getSharedAudio } from "@/engine/audio";
import { getMuted } from "@/engine/storage";

/** Unlock AudioContext + start peaceful ambient on first user gesture. */
export function SiteAudio() {
  useEffect(() => {
    const audio = getSharedAudio();
    audio.setMuted(getMuted());

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
