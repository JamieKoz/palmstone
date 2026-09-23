"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { playUiClick } from "@/components/SiteAudio";
import { getMeta } from "@/engine/catalog";
import { getSharedAudio } from "@/engine/audio";
import type { EngineController } from "@/engine/runtime";
import {
  getHapticsPref,
  getMuted,
  isFavourite,
  pushRecent,
  setHapticsPref,
  setMutedPref,
  toggleFavourite,
} from "@/engine/storage";

type Props = {
  experienceId: string;
};

export function ExperiencePlayer({ experienceId }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<EngineController | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [hapticsOn, setHapticsOn] = useState(true);
  const [fav, setFav] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);

  const meta = getMeta(experienceId);

  useEffect(() => {
    setMuted(getMuted());
    setHapticsOn(getHapticsPref());
    setFav(isFavourite(experienceId));
    pushRecent(experienceId);
  }, [experienceId]);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host || !meta) return;

    (async () => {
      try {
        const [{ startExperience }, { getExperienceModule }] = await Promise.all([
          import("@/engine/runtime"),
          import("@/engine/registry"),
        ]);
        if (cancelled) return;
        const module = getExperienceModule(experienceId);
        if (!module) {
          setError("Could not start this experience.");
          return;
        }
        const controller = await startExperience(host, module);
        if (cancelled) {
          controller.destroy();
          return;
        }
        engineRef.current = controller;
        controller.setMuted(getMuted());
        controller.setHaptics(getHapticsPref());
        setReady(true);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Could not start this experience.");
      }
    })();

    return () => {
      cancelled = true;
      engineRef.current?.destroy();
      engineRef.current = null;
      setReady(false);
    };
  }, [experienceId, meta]);

  useEffect(() => {
    if (!hintVisible) return;
    const t = window.setTimeout(() => setHintVisible(false), 4500);
    return () => window.clearTimeout(t);
  }, [hintVisible, experienceId]);

  if (!meta) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--bg)] px-6 text-center">
        <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
          Experience not found
        </p>
        <Link href="/playground" className="text-[var(--jade)] underline-offset-4 hover:underline">
          Back to playground
        </Link>
      </div>
    );
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[var(--bg)]">
      <div ref={hostRef} className="absolute inset-0" />

      {!ready && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="font-[family-name:var(--font-display)] text-lg tracking-wide text-[var(--mist)]">
            Settling…
          </p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--bg)]">
          <p className="text-[var(--ink)]">{error}</p>
          <Link href="/playground" className="text-[var(--jade)]">
            Back to playground
          </Link>
        </div>
      )}

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3 sm:p-4">
        <Link
          href="/playground"
          onClick={() => playUiClick()}
          className="pointer-events-auto rounded-full bg-[color-mix(in_oklab,var(--bg)_72%,transparent)] px-3 py-2 text-sm text-[var(--mist)] backdrop-blur-md transition hover:text-[var(--ink)]"
          aria-label="Exit to playground"
        >
          ← Exit
        </Link>
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const next = !muted;
              if (next) {
                playUiClick();
                setMuted(true);
                setMutedPref(true);
                getSharedAudio().setMuted(true);
                engineRef.current?.setMuted(true);
              } else {
                setMuted(false);
                setMutedPref(false);
                getSharedAudio().setMuted(false);
                engineRef.current?.setMuted(false);
                playUiClick();
              }
            }}
            className="rounded-full bg-[color-mix(in_oklab,var(--bg)_72%,transparent)] px-3 py-2 text-sm text-[var(--mist)] backdrop-blur-md transition hover:text-[var(--ink)]"
            aria-pressed={muted}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? "Muted" : "Sound"}
          </button>
          <button
            type="button"
            onClick={() => {
              playUiClick();
              const next = !hapticsOn;
              setHapticsOn(next);
              setHapticsPref(next);
              engineRef.current?.setHaptics(next);
            }}
            className="rounded-full bg-[color-mix(in_oklab,var(--bg)_72%,transparent)] px-3 py-2 text-sm text-[var(--mist)] backdrop-blur-md transition hover:text-[var(--ink)]"
            aria-pressed={hapticsOn}
            aria-label={hapticsOn ? "Disable haptics" : "Enable haptics"}
          >
            {hapticsOn ? "Haptics" : "No vibe"}
          </button>
          <button
            type="button"
            onClick={() => {
              playUiClick();
              setFav(toggleFavourite(experienceId));
            }}
            className="rounded-full bg-[color-mix(in_oklab,var(--bg)_72%,transparent)] px-3 py-2 text-sm backdrop-blur-md transition hover:text-[var(--ink)]"
            aria-pressed={fav}
            aria-label={fav ? "Remove favourite" : "Favourite"}
            style={{ color: fav ? "var(--sand)" : "var(--mist)" }}
          >
            {fav ? "★" : "☆"}
          </button>
        </div>
      </header>

      {hintVisible && (
        <button
          type="button"
          onClick={() => {
            playUiClick();
            setHintVisible(false);
          }}
          className="absolute bottom-6 left-1/2 z-10 max-w-[90vw] -translate-x-1/2 rounded-full bg-[color-mix(in_oklab,var(--bg)_75%,transparent)] px-4 py-2 text-center text-sm text-[var(--mist)] backdrop-blur-md transition hover:text-[var(--ink)]"
        >
          {meta.hint}
        </button>
      )}
    </div>
  );
}
