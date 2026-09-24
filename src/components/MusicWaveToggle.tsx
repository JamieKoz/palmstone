"use client";

import { useEffect, useState } from "react";
import { playUiClick } from "@/components/SiteAudio";
import { getSharedAudio } from "@/engine/audio";
import { getMusicMuted, setMusicMutedPref } from "@/engine/storage";

type Props = {
  className?: string;
};

/** Equalizer-style music mute toggle (à la leoparpeix soundButton). */
export function MusicWaveToggle({ className = "" }: Props) {
  const [musicMuted, setMusicMuted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setMusicMuted(getMusicMuted());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        playUiClick();
        const next = !musicMuted;
        setMusicMuted(next);
        setMusicMutedPref(next);
        getSharedAudio().setMusicMuted(next);
      }}
      className={["sound-wave-btn", musicMuted ? "sound-wave-btn--off" : "", className]
        .filter(Boolean)
        .join(" ")}
      aria-pressed={musicMuted}
      aria-label={musicMuted ? "Unmute background music" : "Mute background music"}
    >
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`sound-wave-btn__line sound-wave-btn__line--${i}`} />
      ))}
    </button>
  );
}
