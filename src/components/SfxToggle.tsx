"use client";

import { useEffect, useState } from "react";
import { playUiClick } from "@/components/SiteAudio";
import { getSharedAudio } from "@/engine/audio";
import { getMuted, setMutedPref } from "@/engine/storage";

type Props = {
  className?: string;
  /** Full-width row inside experience settings menu. */
  variant?: "pill" | "menu";
};

/** Mute toggle for experience SFX (separate from background music). */
export function SfxToggle({ className = "", variant = "pill" }: Props) {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setMuted(getMuted());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = () => {
    const next = !muted;
    if (next) playUiClick();
    setMuted(next);
    setMutedPref(next);
    getSharedAudio().setMuted(next);
    if (!next) playUiClick();
  };

  if (variant === "menu") {
    return (
      <button
        type="button"
        className="experience-settings__row"
        aria-pressed={muted}
        aria-label={muted ? "Unmute experience sounds" : "Mute experience sounds"}
        onClick={toggle}
      >
        <span>Sounds</span>
        <span className={muted ? "ui-toggle-off" : ""}>{muted ? "Off" : "On"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={["sfx-toggle", muted ? "ui-toggle-off" : "", className].filter(Boolean).join(" ")}
      aria-pressed={muted}
      aria-label={muted ? "Unmute experience sounds" : "Mute experience sounds"}
      onClick={toggle}
    >
      SFX
    </button>
  );
}
