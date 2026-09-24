"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onExperienceNavClick, playUiClick } from "@/components/SiteAudio";
import { MusicWaveToggle } from "@/components/MusicWaveToggle";
import { PageRevealWipe } from "@/components/PageRevealWipe";
import {
  experiencesInFolder,
  getMeta,
  PLAY_FOLDERS,
  type PlayFolder,
} from "@/engine/catalog";
import type { ExperienceMeta } from "@/engine/types";
import {
  getFavourites,
  getPreferredModalities,
  getRecents,
  toggleFavourite,
} from "@/engine/storage";

type OpenFolder =
  | { kind: "play"; folder: PlayFolder }
  | { kind: "favourites" }
  | null;

export function PlaygroundGallery() {
  const [favs, setFavs] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState<OpenFolder>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setFavs(getFavourites());
      setRecents(getRecents());
      setPrefs(getPreferredModalities(2));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const continueMeta = useMemo(() => {
    if (!ready) return undefined;
    const id = recents[0];
    return id ? getMeta(id) : undefined;
  }, [ready, recents]);

  const favExperiences = useMemo(
    () => favs.map((id) => getMeta(id)).filter(Boolean) as ExperienceMeta[],
    [favs],
  );

  const folderItems = useMemo(() => {
    return PLAY_FOLDERS.map((folder) => ({
      folder,
      items: experiencesInFolder(folder),
    })).filter((f) => f.items.length > 0);
  }, []);

  const openItems: ExperienceMeta[] =
    open?.kind === "favourites"
      ? favExperiences
      : open?.kind === "play"
        ? experiencesInFolder(open.folder)
        : [];

  const openTitle =
    open?.kind === "favourites"
      ? "Favourites"
      : open?.kind === "play"
        ? open.folder.name
        : "";

  const openAccent =
    open?.kind === "favourites"
      ? "var(--sand)"
      : open?.kind === "play"
        ? open.folder.accent
        : "var(--jade)";

  const subtitle = !ready
    ? "Pick a feel. Stay as long as you like."
    : prefs.length > 0
      ? `You lean ${prefs[0].toLowerCase()} — open a folder to play.`
      : "Open a folder. Stay as long as you like.";

  return (
    <>
      <div className="relative min-h-dvh overflow-x-hidden">
        <PageRevealWipe />
        <div className="atmosphere" aria-hidden />
        <div className="grain-overlay" aria-hidden />

        <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col px-4 pb-[max(4rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-8 sm:pt-12">
          <header className="mb-8 flex flex-col gap-6 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Link
                href="/"
                onClick={() => playUiClick()}
                className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--ink)] sm:text-4xl"
              >
                Palmstone
              </Link>
              <p className="mt-2 max-w-md text-[var(--mist)]">{subtitle}</p>
            </div>
            <MusicWaveToggle className="sound-wave-btn--gallery" />
          </header>

          {continueMeta && (
            <Link
              href={`/playground/${continueMeta.id}`}
              onClick={() => onExperienceNavClick()}
              className="mb-8 flex items-center justify-between gap-4 rounded-2xl px-4 py-4 transition sm:px-5"
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

          <div className="folder-grid">
            {favExperiences.length > 0 && (
              <button
                type="button"
                className="folder-tile"
                onClick={() => {
                  playUiClick();
                  setOpen({ kind: "favourites" });
                }}
              >
                <FolderPreview
                  accents={favExperiences.slice(0, 4).map((e) => e.accent)}
                  tint="color-mix(in oklab, var(--sand) 35%, var(--panel))"
                />
                <span className="folder-tile__name">Favourites</span>
                <span className="folder-tile__count">{favExperiences.length}</span>
              </button>
            )}

            {folderItems.map(({ folder, items }, i) => (
              <button
                type="button"
                key={folder.id}
                className="folder-tile"
                style={{ animationDelay: `${i * 50}ms` }}
                onClick={() => {
                  playUiClick();
                  setOpen({ kind: "play", folder });
                }}
              >
                <FolderPreview
                  accents={items.slice(0, 4).map((e) => e.accent)}
                  tint={`color-mix(in oklab, ${folder.accent} 28%, var(--panel))`}
                />
                <span className="folder-tile__name">{folder.name}</span>
                <span className="folder-tile__blurb">{folder.blurb}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {open && (
        <div
          className="folder-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={openTitle}
        >
          <button
            type="button"
            className="folder-sheet__backdrop"
            aria-label="Close folder"
            onClick={() => {
              playUiClick();
              setOpen(null);
            }}
          />
          <div
            className="folder-sheet__panel"
            style={{ ["--folder-accent" as string]: openAccent }}
          >
            <div className="folder-sheet__head">
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--fade)]">Folder</p>
                <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
                  {openTitle}
                </h2>
              </div>
              <button
                type="button"
                className="folder-sheet__close"
                onClick={() => {
                  playUiClick();
                  setOpen(null);
                }}
              >
                Close
              </button>
            </div>

            <ul className="folder-sheet__list">
              {openItems.map((exp) => {
                const starred = favs.includes(exp.id);
                return (
                  <li key={exp.id} className="group relative">
                    <Link
                      href={`/playground/${exp.id}`}
                      onClick={() => onExperienceNavClick()}
                      className="folder-sheet__row"
                    >
                      <span
                        className="folder-sheet__swatch"
                        style={{ background: exp.accent }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
                          {exp.name}
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-[var(--mist)]">
                          {exp.tagline}
                        </span>
                      </span>
                      {exp.badge && (
                        <span className="hidden rounded-full bg-[color-mix(in_oklab,var(--jade)_25%,transparent)] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--jade)] sm:inline">
                          {exp.badge}
                        </span>
                      )}
                    </Link>
                    <button
                      type="button"
                      className="folder-sheet__fav"
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
          </div>
        </div>
      )}
    </>
  );
}

function FolderPreview({
  accents,
  tint,
}: {
  accents: string[];
  tint: string;
}) {
  const cells = [0, 1, 2, 3].map((i) => accents[i] ?? "transparent");
  return (
    <div className="folder-preview" style={{ background: tint }}>
      {cells.map((c, i) => (
        <span
          key={i}
          className="folder-preview__cell"
          style={{
            background:
              c === "transparent"
                ? "color-mix(in oklab, var(--bg) 35%, transparent)"
                : c,
          }}
        />
      ))}
    </div>
  );
}
