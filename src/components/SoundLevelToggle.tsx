"use client";

import { useEffect, useState } from "react";
import { playUiClick } from "@/components/SiteAudio";
import {
  SOUND_LEVEL_LABELS,
  applySoundLevel,
  cycleSoundLevel,
  resolveSoundLevel,
} from "@/engine/soundLevel";
import type { SoundLevel } from "@/engine/storage";

type Props = {
  className?: string;
  /** Full-width row inside experience settings menu. */
  variant?: "pill" | "menu" | "wave";
};

export function SoundLevelToggle({ className, variant = "pill" }: Props) {
  const [level, setLevel] = useState<SoundLevel>("immersive");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const resolved = resolveSoundLevel();
      setLevel(resolved);
      applySoundLevel(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const cycle = () => {
    playUiClick();
    const next = cycleSoundLevel();
    setLevel(next);
  };

  if (variant === "menu") {
    return (
      <button
        type="button"
        className="experience-settings__row"
        aria-label={`Sound level, ${SOUND_LEVEL_LABELS[level]}`}
        onClick={cycle}
      >
        <span>Sound</span>
        <span className={level === "off" ? "ui-toggle-off" : ""}>{SOUND_LEVEL_LABELS[level]}</span>
      </button>
    );
  }

  if (variant === "wave") {
    return (
      <button
        type="button"
        className={[
          "sound-wave-btn",
          level === "off" ? "sound-wave-btn--off" : "",
          level === "soft" ? "sound-wave-btn--soft" : "",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={`Sound, ${SOUND_LEVEL_LABELS[level]}. Tap to change.`}
        title={`Sound · ${SOUND_LEVEL_LABELS[level]}`}
        onClick={cycle}
      >
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`sound-wave-btn__line sound-wave-btn__line--${i}`} />
        ))}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={["sound-level-toggle", className ?? ""].filter(Boolean).join(" ")}
      aria-label={`Sound level, ${SOUND_LEVEL_LABELS[level]}`}
      onClick={cycle}
    >
      Sound · {SOUND_LEVEL_LABELS[level]}
    </button>
  );
}
