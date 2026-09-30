"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AddToHome } from "@/components/AddToHome";
import { ExperienceThumb } from "@/components/ExperienceThumb";
import { MusicWaveToggle } from "@/components/MusicWaveToggle";
import { PageRevealWipe } from "@/components/PageRevealWipe";
import { onExperienceNavClick, playUiClick } from "@/components/SiteAudio";
import { getSharedAudio } from "@/engine/audio";
import { TRAY_GROUPS, experiencesInGroup, getMeta, trayExperiences } from "@/engine/catalog";
import { fireHaptic } from "@/engine/haptics";
import {
  getFavourites,
  getHapticsPref,
  getMuted,
  getPreferredModalities,
  getRecents,
  setMutedPref,
  toggleFavourite,
  topAffinityIds,
} from "@/engine/storage";
import type { ExperienceMeta } from "@/engine/types";

type Lean = { id: string; x: number; y: number };

export function PlaygroundGallery() {
  const router = useRouter();
  const trayRef = useRef<HTMLDivElement>(null);
  const stonesRef = useRef(new Map<string, HTMLButtonElement>());
  const lastStone = useRef<string | null>(null);
  const pressId = useRef<string | null>(null);

  const [favs, setFavs] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [restId, setRestId] = useState<string | null>(null);
  const [lean, setLean] = useState<Lean | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setFavs(getFavourites());
      setRecents(getRecents());
      setPrefs(getPreferredModalities(2));
      setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      setReady(true);
    });
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduce(media.matches);
    media.addEventListener("change", onChange);
    return () => {
      cancelled = true;
      media.removeEventListener("change", onChange);
    };
  }, []);

  const groups = TRAY_GROUPS.map((group) => ({
    group,
    items: experiencesInGroup(group),
  }));

  const continueMeta = ready && recents[0] ? getMeta(recents[0]) : undefined;
  const rest = restId ? getMeta(restId) : undefined;

  const loved = ready
    ? topAffinityIds(2)
        .map((id) => getMeta(id)?.name)
        .filter((name): name is string => !!name)
    : [];
  const subtitle = !ready
    ? "Brush a stone. Press to settle."
    : loved.length === 1
      ? `You keep coming back to ${loved[0]}.`
      : loved.length > 1
        ? `You keep coming back to ${loved[0]} and ${loved[1]}.`
        : prefs.length > 0
          ? `You lean toward ${prefs[0].toLowerCase()}.`
          : "Brush a stone. Press to settle.";

  const settle = useCallback(
    (exp: ExperienceMeta) => {
      onExperienceNavClick();
      router.push(`/playground/${exp.id}`);
    },
    [router],
  );

  const surprise = useCallback(() => {
    const all = trayExperiences();
    const pool = all.filter((exp) => exp.id !== continueMeta?.id);
    const choices = pool.length > 0 ? pool : all;
    const pick = choices[Math.floor(Math.random() * choices.length)];
    if (!pick) return;
    settle(pick);
  }, [continueMeta, settle]);

  const tick = useCallback(() => {
    if (reduce) return;
    const audio = getSharedAudio();
    void audio.resume().then(() => audio.click(0.22, 1.08));
    if (getHapticsPref()) fireHaptic(8);
  }, [reduce]);

  const lookAt = useCallback(
    (clientX: number, clientY: number) => {
      let best: { id: string; dx: number; dy: number; reach: number; dist: number } | null = null;
      for (const [id, el] of stonesRef.current) {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = clientX - cx;
        const dy = clientY - cy;
        const dist = Math.hypot(dx, dy);
        const reach = Math.max(rect.width, rect.height) * 0.78;
        if (dist > reach) continue;
        if (!best || dist < best.dist) best = { id, dx, dy, reach, dist };
      }

      if (!best) {
        lastStone.current = null;
        setRestId(null);
        setLean(null);
        return;
      }

      if (lastStone.current && lastStone.current !== best.id) tick();
      lastStone.current = best.id;
      setRestId(best.id);
      if (reduce) {
        setLean(null);
        return;
      }
      const pull = 7;
      setLean({
        id: best.id,
        x: (best.dx / best.reach) * pull,
        y: (best.dy / best.reach) * pull,
      });
    },
    [reduce, tick],
  );

  return (
    <>
      <div className="relative min-h-dvh overflow-x-hidden">
        <PageRevealWipe />
        <div className="atmosphere" aria-hidden />
        <div className="grain-overlay" aria-hidden />

        <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col px-4 pb-[max(5.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-8 sm:pt-12">
          <header className="mb-6 sm:mb-8">
            <div className="flex items-start justify-between gap-3">
              <Link
                href="/"
                onClick={() => playUiClick()}
                className="inline-flex items-center gap-2.5 font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--ink)] sm:text-4xl"
              >
                <span className="polished-orb header-mark" aria-hidden />
                Palmstone
              </Link>
              <div className="gallery-audio">
                <MusicWaveToggle className="sound-wave-btn--gallery" />
                <SfxToggle />
              </div>
            </div>
            <p className="mt-2 max-w-md text-[var(--mist)]">{subtitle}</p>
            <div className="gallery-links">
              {continueMeta && (
                <Link
                  href={`/playground/${continueMeta.id}`}
                  onClick={() => onExperienceNavClick()}
                  className="favourites-link"
                >
                  Continue {continueMeta.name}
                </Link>
              )}
              <button type="button" className="favourites-link" onClick={surprise}>
                Surprise me
              </button>
              <AddToHome />
            </div>
          </header>

          <div
            ref={trayRef}
            className={reduce ? "tray is-still" : "tray"}
            onPointerMove={(e) => {
              lookAt(e.clientX, e.clientY);
            }}
            onPointerLeave={() => {
              lastStone.current = null;
              setRestId(null);
              setLean(null);
            }}
          >
            {groups.map(({ group, items }) => (
              <section key={group.id} className="tray-group" aria-label={group.name}>
                <h2 className="tray-group__name">{group.name}</h2>
                <div className="tray-group__stones">
                  {items.map((exp) => {
                    const kept = favs.includes(exp.id);
                    const shift = !reduce && lean?.id === exp.id ? lean : null;
                    return (
                      <button
                        key={exp.id}
                        type="button"
                        ref={(node) => {
                          if (node) stonesRef.current.set(exp.id, node);
                          else stonesRef.current.delete(exp.id);
                        }}
                        className={["tray-stone", kept ? "is-kept" : "", restId === exp.id ? "is-rest" : ""]
                          .filter(Boolean)
                          .join(" ")}
                        style={
                          shift
                            ? { transform: `translate(${shift.x.toFixed(2)}px, ${shift.y.toFixed(2)}px)` }
                            : undefined
                        }
                        aria-label={exp.name}
                        onPointerDown={() => {
                          pressId.current = exp.id;
                        }}
                        onClick={() => {
                          const started = pressId.current;
                          pressId.current = null;
                          if (started && started !== exp.id) return;
                          settle(exp);
                        }}
                      >
                        <span className="tray-stone__face">
                          <ExperienceThumb id={exp.id} />
                        </span>
                        <span className="tray-stone__name">{exp.name}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        {rest && (
          <div className="tray-caption" aria-live="polite">
            <p className="tray-caption__name">{rest.name}</p>
            <p className="tray-caption__line">{rest.tagline}</p>
            <button
              type="button"
              className="tray-caption__keep"
              aria-pressed={favs.includes(rest.id)}
              onClick={() => {
                playUiClick();
                toggleFavourite(rest.id);
                setFavs(getFavourites());
              }}
            >
              {favs.includes(rest.id) ? "Kept" : "Keep"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function SfxToggle() {
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

  return (
    <button
      type="button"
      className={["sfx-toggle", muted ? "ui-toggle-off" : ""].filter(Boolean).join(" ")}
      aria-pressed={muted}
      aria-label={muted ? "Unmute experience sounds" : "Mute experience sounds"}
      onClick={() => {
        const next = !muted;
        if (next) playUiClick();
        setMuted(next);
        setMutedPref(next);
        getSharedAudio().setMuted(next);
        if (!next) playUiClick();
      }}
    >
      SFX
    </button>
  );
}
