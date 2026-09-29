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

const TIMER_MINUTES = [3, 5, 10, 20] as const;

function CogIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
      />
      <path
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}

function formatRemain(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
  const [zen, setZen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timesOpen, setTimesOpen] = useState(false);
  const [timerEndsAt, setTimerEndsAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [timerDone, setTimerDone] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

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
      setZen(false);
      setSettingsOpen(false);
      setTimesOpen(false);
      setTimerEndsAt(null);
      setRemaining(null);
      setTimerDone(false);
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
    if (timerEndsAt == null) return;
    const tick = () => {
      const left = timerEndsAt - Date.now();
      if (left <= 0) {
        setTimerEndsAt(null);
        setRemaining(null);
        setZen(false);
        setTimerDone(true);
        return;
      }
      setRemaining(left);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [timerEndsAt]);

  useEffect(() => {
    if (!timerDone) return;
    const audio = getSharedAudio();
    audio.tone(311, 0.1, 0.7);
    const second = window.setTimeout(() => audio.tone(392, 0.08, 1.1), 480);
    return () => window.clearTimeout(second);
  }, [timerDone]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (settingsRef.current?.contains(target)) return;
      setTimesOpen(false);
      setSettingsOpen(false);
    };
    window.addEventListener("pointerdown", onPointer, true);
    return () => window.removeEventListener("pointerdown", onPointer, true);
  }, [settingsOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (settingsOpen) {
        setTimesOpen(false);
        setSettingsOpen(false);
        return;
      }
      if (zen) setZen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, zen]);

  useEffect(() => {
    if (!hintVisible || entering || exiting || !ready) return;
    const t = window.setTimeout(() => setHintVisible(false), 4500);
    return () => window.clearTimeout(t);
  }, [hintVisible, experienceId, entering, exiting, ready]);

  const startTimer = (minutes: number) => {
    playUiClick();
    setTimerDone(false);
    setTimerEndsAt(Date.now() + minutes * 60_000);
    setTimesOpen(false);
  };

  const clearTimer = () => {
    playUiClick();
    setTimerEndsAt(null);
    setRemaining(null);
    setTimerDone(false);
    setTimesOpen(false);
  };

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
    <div
      className={["experience-stage relative h-dvh w-full overflow-hidden bg-[var(--bg)]", zen ? "is-zen" : ""]
        .filter(Boolean)
        .join(" ")}
    >
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

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3 sm:p-4">
        <button
          type="button"
          onClick={exitToPlayground}
          className="experience-chrome__exit pointer-events-auto rounded-full bg-[color-mix(in_oklab,var(--bg)_72%,transparent)] px-3 py-2 text-sm text-[var(--mist)] backdrop-blur-md transition hover:text-[var(--ink)]"
          inert={zen || undefined}
          aria-label="Exit to playground"
        >
          ← Exit
        </button>
        <div className="experience-settings pointer-events-auto" ref={settingsRef}>
          <button
            type="button"
            className="experience-settings__cog"
            aria-expanded={settingsOpen}
            aria-label={settingsOpen ? "Close settings" : "Settings"}
            onClick={() => {
              playUiClick();
              setTimesOpen(false);
              setSettingsOpen((open) => !open);
            }}
            style={
              zen
                ? { color: "var(--ink)", background: "color-mix(in oklab, var(--jade) 42%, var(--bg))" }
                : undefined
            }
          >
            <CogIcon />
          </button>
          {settingsOpen && (
            <div className="experience-settings__menu" role="group" aria-label="Experience settings">
              <div className="experience-settings__timer">
                <button
                  type="button"
                  className="experience-settings__row"
                  aria-expanded={timesOpen}
                  aria-label={
                    remaining != null
                      ? `Timer, ${formatRemain(remaining)} left`
                      : "Timer, choose a length"
                  }
                  onClick={() => {
                    playUiClick();
                    setTimesOpen((open) => !open);
                  }}
                >
                  <span>Timer</span>
                  <span className={remaining == null ? "ui-toggle-off" : ""}>
                    {remaining != null ? formatRemain(remaining) : "Off"}
                  </span>
                </button>
                {timesOpen && (
                  <div className="experience-settings__times" role="group" aria-label="Session length">
                    {TIMER_MINUTES.map((minutes) => (
                      <button key={minutes} type="button" onClick={() => startTimer(minutes)}>
                        {minutes} min
                      </button>
                    ))}
                    {remaining != null && (
                      <button type="button" onClick={clearTimer}>
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="experience-settings__row">
                <span>Music</span>
                <MusicWaveToggle />
              </div>
              <button
                type="button"
                className="experience-settings__row"
                aria-pressed={muted}
                aria-label={muted ? "Unmute experience sounds" : "Mute experience sounds"}
                onClick={() => {
                  const next = !muted;
                  if (next) playUiClick();
                  setMuted(next);
                  setMutedPref(next);
                  getSharedAudio().setMuted(next);
                  engineRef.current?.setMuted(next);
                  if (!next) playUiClick();
                }}
              >
                <span>Sounds</span>
                <span className={muted ? "ui-toggle-off" : ""}>{muted ? "Off" : "On"}</span>
              </button>
              <button
                type="button"
                className="experience-settings__row"
                aria-pressed={hapticsOn}
                onClick={() => {
                  playUiClick();
                  const next = !hapticsOn;
                  setHapticsOn(next);
                  setHapticsPref(next);
                  engineRef.current?.setHaptics(next);
                }}
              >
                <span>Haptics</span>
                <span className={hapticsOn ? "" : "ui-toggle-off"}>{hapticsOn ? "On" : "Off"}</span>
              </button>
              <button
                type="button"
                className="experience-settings__row"
                aria-pressed={fav}
                aria-label={fav ? "Remove favourite" : "Favourite"}
                onClick={() => {
                  playUiClick();
                  setFav(toggleFavourite(experienceId));
                }}
              >
                <span>Favourite</span>
                <span style={{ color: fav ? "var(--sand)" : "var(--fade)" }}>{fav ? "★" : "☆"}</span>
              </button>
              <button
                type="button"
                className="experience-settings__row"
                aria-pressed={zen}
                onClick={() => {
                  playUiClick();
                  setZen((on) => !on);
                }}
              >
                <span>Zen</span>
                <span className={zen ? "" : "ui-toggle-off"}>{zen ? "On" : "Off"}</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {hintVisible && ready && !entering && !exiting && (
        <button
          type="button"
          onClick={() => {
            playUiClick();
            setHintVisible(false);
          }}
          className="experience-hint absolute bottom-6 left-1/2 z-10 max-w-[90vw] -translate-x-1/2 rounded-full bg-[color-mix(in_oklab,var(--bg)_75%,transparent)] px-4 py-2 text-center text-sm text-[var(--mist)] backdrop-blur-md transition hover:text-[var(--ink)]"
          inert={zen || undefined}
        >
          {meta.hint}
        </button>
      )}

      {timerDone && (
        <div className="session-end" role="status">
          <p className="session-end__title">That&apos;s your time.</p>
          <p className="session-end__note">Stay if you want, or step out.</p>
          <div className="session-end__actions">
            <button type="button" onClick={() => setTimerDone(false)}>
              Stay
            </button>
            <button type="button" onClick={exitToPlayground}>
              Step out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
