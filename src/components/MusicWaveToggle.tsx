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
  const [scales, setScales] = useState([0.45, 0.7, 0.35, 0.6]);

  useEffect(() => {
    setMusicMuted(getMusicMuted());
  }, []);

  useEffect(() => {
    if (musicMuted) {
      setScales([0.1, 0.1, 0.1, 0.1]);
      return;
    }
    let raf = 0;
    let t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      // Soft independent sine waves — like the leoparpeix bars
      setScales([
        0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 4.2)),
        0.2 + 0.7 * (0.5 + 0.5 * Math.sin(t * 5.1 + 1.2)),
        0.22 + 0.65 * (0.5 + 0.5 * Math.sin(t * 3.7 + 2.1)),
        0.28 + 0.55 * (0.5 + 0.5 * Math.sin(t * 4.8 + 0.6)),
      ]);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [musicMuted]);

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
      {scales.map((s, i) => (
        <span
          key={i}
          className={`sound-wave-btn__line sound-wave-btn__line--${i}`}
          style={{ transform: `scaleY(${s})` }}
        />
      ))}
    </button>
  );
}
