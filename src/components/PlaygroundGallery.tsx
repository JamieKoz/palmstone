"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onExperienceNavClick, playUiClick } from "@/components/SiteAudio";
import { MusicWaveToggle } from "@/components/MusicWaveToggle";
import { PageRevealWipe } from "@/components/PageRevealWipe";
import { CATALOG, getMeta, MODALITIES } from "@/engine/catalog";
import {
  getFavourites,
  getPreferredModalities,
  getRecents,
  toggleFavourite,
} from "@/engine/storage";

export function PlaygroundGallery() {
  const [favs, setFavs] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "favourites" | "webgl" | string>("all");

  useEffect(() => {
    setFavs(getFavourites());
    setRecents(getRecents());
    setPrefs(getPreferredModalities(2));
  }, []);

  const continueMeta = useMemo(() => {
    const id = recents[0];
    return id ? getMeta(id) : undefined;
  }, [recents]);

  const forYou = useMemo(() => {
    if (prefs.length === 0) return [];
    return CATALOG.filter(
      (e) => prefs.includes(e.modality) && e.id !== continueMeta?.id,
    ).slice(0, 4);
  }, [prefs, continueMeta]);

  const list = useMemo(() => {
    let base = [...CATALOG];
    if (filter === "favourites") base = base.filter((e) => favs.includes(e.id));
    else if (filter === "webgl") base = base.filter((e) => e.badge === "WebGL");
    else if (filter !== "all" && MODALITIES.includes(filter)) {
      base = base.filter((e) => e.modality === filter);
    }

    if (filter === "all") {
      const prefSet = new Set(prefs);
      const score = (id: string) => {
        const meta = getMeta(id);
        const fi = favs.indexOf(id);
        const ri = recents.indexOf(id);
        const pref = meta && prefSet.has(meta.modality) ? 200 : 0;
        const web = meta?.badge === "WebGL" ? 40 : 0;
        return (fi >= 0 ? 1000 - fi : 0) + (ri >= 0 ? 100 - ri : 0) + pref + web;
      };
      base.sort((a, b) => score(b.id) - score(a.id));
    }
    return base;
  }, [favs, recents, filter, prefs]);

  const filterChips: { id: string; label: string }[] = [
    { id: "all", label: "All" },
    { id: "favourites", label: "Favourites" },
    { id: "webgl", label: "WebGL" },
    ...MODALITIES.filter((m) => m !== "WebGL").map((m) => ({ id: m, label: m })),
  ];

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <PageRevealWipe />
      <div className="atmosphere" aria-hidden />
      <div className="grain-overlay" aria-hidden />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        <header className="mb-8 flex flex-col gap-6 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/"
              onClick={() => playUiClick()}
              className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--ink)] sm:text-4xl"
            >
              Palmstone
            </Link>
            <p className="mt-2 max-w-md text-[var(--mist)]">
              {prefs.length > 0
                ? `Pick up a ${prefs[0].toLowerCase()} feel — or wander.`
                : "Pick a feel. Stay as long as you like."}
            </p>
          </div>
          <MusicWaveToggle className="sound-wave-btn--gallery" />
        </header>

        {continueMeta && (
          <Link
            href={`/playground/${continueMeta.id}`}
            onClick={(e) => onExperienceNavClick(e)}
            className="mb-6 flex items-center justify-between gap-4 rounded-2xl px-4 py-4 transition sm:px-5"
            style={{
              background: "color-mix(in oklab, var(--panel) 70%, transparent)",
              borderLeft: `3px solid ${continueMeta.accent}`,
            }}
          >
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--fade)]">Continue</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
                {continueMeta.name}
              </p>
            </div>
            <span className="text-[var(--jade)]">Play →</span>
          </Link>
        )}

        {forYou.length > 0 && filter === "all" && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs uppercase tracking-[0.18em] text-[var(--fade)]">
              For you
            </h2>
            <ul className="flex flex-col gap-1">
              {forYou.map((exp) => (
                <li key={exp.id}>
                  <Link
                    href={`/playground/${exp.id}`}
                    onClick={(e) => onExperienceNavClick(e)}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-[color-mix(in_oklab,var(--panel)_60%,transparent)]"
                  >
                    <span
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{ background: exp.accent }}
                      aria-hidden
                    />
                    <span className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
                      {exp.name}
                    </span>
                    <span className="text-xs uppercase tracking-[0.14em] text-[var(--fade)]">
                      {exp.modality}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mb-6 flex items-center gap-3">
          <label htmlFor="playground-filter" className="text-xs uppercase tracking-[0.18em] text-[var(--fade)]">
            Show
          </label>
          <select
            id="playground-filter"
            value={filter}
            onChange={(e) => {
              playUiClick();
              setFilter(e.target.value);
            }}
            className="min-w-[11rem] appearance-none rounded-full border-0 bg-[color-mix(in_oklab,var(--panel)_80%,transparent)] bg-[length:12px] bg-[position:right_14px_center] bg-no-repeat px-4 py-2.5 pr-10 text-sm text-[var(--ink)] outline-none transition hover:bg-[color-mix(in_oklab,var(--panel)_95%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--jade)]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23a8b0a6' d='M1 1l5 5 5-5'/%3E%3C/svg%3E")`,
            }}
          >
            {filterChips.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {list.length === 0 ? (
          <p className="text-[var(--mist)]">Nothing here yet — try another filter.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {list.map((exp, i) => {
              const starred = favs.includes(exp.id);
              return (
                <li key={exp.id} className="group relative">
                  <Link
                    href={`/playground/${exp.id}`}
                    onClick={(e) => onExperienceNavClick(e)}
                    className="gallery-row flex items-center gap-4 rounded-2xl px-4 py-4 transition sm:gap-6 sm:px-5 sm:py-5"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <span
                      className="h-10 w-1.5 shrink-0 rounded-full sm:h-12"
                      style={{ background: exp.accent }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1 pr-10 sm:pr-20">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)] sm:text-2xl">
                          {exp.name}
                        </h2>
                        <span className="text-xs uppercase tracking-[0.18em] text-[var(--fade)]">
                          {exp.modality}
                        </span>
                        {exp.badge && (
                          <span className="rounded-full bg-[color-mix(in_oklab,var(--jade)_25%,transparent)] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--jade)]">
                            {exp.badge}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm text-[var(--mist)] sm:whitespace-normal">
                        {exp.tagline}
                      </p>
                    </div>
                    <span className="hidden text-sm text-[var(--fade)] transition group-hover:text-[var(--jade)] sm:inline">
                      Play
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full px-3 py-2 text-lg sm:right-16"
                    style={{ color: starred ? "var(--sand)" : "var(--fade)" }}
                    aria-label={starred ? "Remove favourite" : "Favourite"}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      playUiClick();
                      toggleFavourite(exp.id);
                      setFavs(getFavourites());
                    }}
                  >
                    {starred ? "★" : "☆"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
