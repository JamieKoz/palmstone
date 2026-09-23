"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CATALOG } from "@/engine/catalog";
import { getFavourites, getRecents, toggleFavourite } from "@/engine/storage";

export function PlaygroundGallery() {
  const [favs, setFavs] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "favourites">("all");

  useEffect(() => {
    setFavs(getFavourites());
    setRecents(getRecents());
  }, []);

  const list = useMemo(() => {
    if (filter === "favourites") {
      return CATALOG.filter((e) => favs.includes(e.id));
    }
    const score = (id: string) => {
      const fi = favs.indexOf(id);
      const ri = recents.indexOf(id);
      return (fi >= 0 ? 1000 - fi : 0) + (ri >= 0 ? 100 - ri : 0);
    };
    return [...CATALOG].sort((a, b) => score(b.id) - score(a.id));
  }, [favs, recents, filter]);

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="atmosphere" aria-hidden />
      <div className="grain-overlay" aria-hidden />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        <header className="mb-10 flex flex-col gap-6 sm:mb-14 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/"
              className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--ink)] sm:text-4xl"
            >
              Palmstone
            </Link>
            <p className="mt-2 max-w-md text-[var(--mist)]">
              Pick a feel. Stay as long as you like.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-full px-4 py-2 text-sm transition ${
                filter === "all"
                  ? "bg-[var(--jade)] text-[var(--bg)]"
                  : "bg-[color-mix(in_oklab,var(--panel)_80%,transparent)] text-[var(--mist)]"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilter("favourites")}
              className={`rounded-full px-4 py-2 text-sm transition ${
                filter === "favourites"
                  ? "bg-[var(--sand)] text-[var(--bg)]"
                  : "bg-[color-mix(in_oklab,var(--panel)_80%,transparent)] text-[var(--mist)]"
              }`}
            >
              Favourites
            </button>
          </div>
        </header>

        {list.length === 0 ? (
          <p className="text-[var(--mist)]">No favourites yet — star one while you play.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {list.map((exp, i) => {
              const starred = favs.includes(exp.id);
              return (
                <li key={exp.id} className="group relative">
                  <Link
                    href={`/playground/${exp.id}`}
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
