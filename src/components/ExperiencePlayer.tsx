"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { playUiClick } from "@/components/SiteAudio";
import { MusicWaveToggle } from "@/components/MusicWaveToggle";
import { armPageRevealWipe } from "@/components/PageRevealWipe";
import { getMeta } from "@/engine/catalog";
import { getSharedAudio } from "@/engine/audio";
import type { EngineController } from "@/engine/runtime";
import {
  getHapticsPref,
  getMuted,
  isFavourite,
  pushRecent,
  recordExperiencePlay,
  recordModalityPlay,
  setHapticsPref,
  setMutedPref,
  toggleFavourite,
} from "@/engine/storage";

type Props = {
  experienceId: string;
};

type TransitionPhase = "enter" | "idle" | "exit";

function muteToggleClass(off: boolean) {
  return [
    "rounded-full bg-[color-mix(in_oklab,var(--bg)_72%,transparent)] px-3 py-2 text-sm backdrop-blur-md transition",
    off ? "ui-toggle-off" : "text-[var(--mist)] hover:text-[var(--ink)]",
  ].join(" ");
}

export function ExperiencePlayer({ experienceId }: Props) {
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<EngineController | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [hapticsOn, setHapticsOn] = useState(true);
  const [fav, setFav] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const [phase, setPhase] = useState<TransitionPhase>("enter");

  const meta = getMeta(experienceId);
  const entering = phase === "enter";
  const exiting = phase === "exit";

  useEffect(() => {
    pushRecent(experienceId);
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setPhase("enter");
      setHintVisible(true);
      setReady(false);
      setError(null);
      setMuted(getMuted());
      setHapticsOn(getHapticsPref());
      setFav(isFavourite(experienceId));
    });
    return () => {
      cancelled = true;
    };
  }, [experienceId]);

  useEffect(() => {
    if (!ready || phase !== "enter") return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = reduce ? 0 : 1100;
    const t = window.setTimeout(() => setPhase("idle"), ms);
    return () => window.clearTimeout(t);
  }, [ready, experienceId, phase]);

  useEffect(() => {
    if (phase !== "exit") return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = reduce ? 0 : 650;
    const t = window.setTimeout(() => {
      router.push("/playground");
    }, ms);
    return () => window.clearTimeout(t);
  }, [phase, router]);

  useEffect(() => {
    if (!meta) return;
    const modality = meta.modality;
    let last = performance.now();
    const flush = () => {
      const now = performance.now();
      const seconds = (now - last) / 1000;
      last = now;
      recordModalityPlay(modality, seconds);
      recordExperiencePlay(experienceId, seconds);
    };
    const interval = window.setInterval(flush, 4000);
    const onPageHide = () => flush();
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVis);
      flush();
    };
  }, [experienceId, meta]);

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
        const experience = getExperienceModule(experienceId);
        if (!experience) {
          setError("Could not start this experience.");
          return;
        }
        const controller = await startExperience(host, experience);
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
    if (!hintVisible || entering || exiting || !ready) return;
    const t = window.setTimeout(() => setHintVisible(false), 4500);
    return () => window.clearTimeout(t);
  }, [hintVisible, experienceId, entering, exiting, ready]);

  const exitToPlayground = () => {
    if (exiting) return;
    playUiClick();
    armPageRevealWipe(meta?.accent);
    setHintVisible(false);
    setPhase("exit");
  };

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

  const hostClass = [
    "experience-host absolute inset-0",
    ready && entering ? "experience-host--entering" : "",
    exiting ? "experience-host--exiting" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[var(--bg)]">
      <div ref={hostRef} className={hostClass} />

      {ready && (entering || exiting) && (
        <div
          className={`circle-wipe circle-wipe--${entering ? "enter" : "exit"}`}
          style={{
            ["--enter-accent" as string]: meta.accent,
          }}
          aria-hidden
        >
          <div className="circle-wipe__blob" />
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
        <button
          type="button"
          onClick={exitToPlayground}
          className="pointer-events-auto rounded-full bg-[color-mix(in_oklab,var(--bg)_72%,transparent)] px-3 py-2 text-sm text-[var(--mist)] backdrop-blur-md transition hover:text-[var(--ink)]"
          aria-label="Exit to playground"
        >
          ← Exit
        </button>
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
          <MusicWaveToggle />

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
            className={muteToggleClass(muted)}
            aria-pressed={muted}
            aria-label={muted ? "Unmute experience sounds" : "Mute experience sounds"}
          >
            SFX
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
            className={muteToggleClass(!hapticsOn)}
            aria-pressed={hapticsOn}
            aria-label={hapticsOn ? "Disable haptics" : "Enable haptics"}
          >
            Haptics
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

      {hintVisible && ready && !entering && !exiting && (
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
