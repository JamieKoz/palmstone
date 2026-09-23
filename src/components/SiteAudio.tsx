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
      void audio.unlockAndStartPeace();
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  return null;
}

/** Soft playful UI click (call from button/link handlers). */
export function playUiClick() {
  const audio = getSharedAudio();
  void audio.resume();
  void audio.unlockAndStartPeace();
  audio.uiSoft();
}
