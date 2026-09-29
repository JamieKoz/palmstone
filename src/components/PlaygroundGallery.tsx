"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { onExperienceNavClick, playUiClick } from "@/components/SiteAudio";
import { MusicWaveToggle } from "@/components/MusicWaveToggle";
import { getSharedAudio } from "@/engine/audio";
import { getMuted, setMutedPref } from "@/engine/storage";
import { ExperienceThumb } from "@/components/ExperienceThumb";
import { PageRevealWipe } from "@/components/PageRevealWipe";
import {
  experiencesInFolder,
  getMeta,
  PLAY_FOLDERS,
  signatureExperiences,
  type PlayFolder,
} from "@/engine/catalog";
import type { ExperienceId, ExperienceMeta } from "@/engine/types";
import {
  getFavourites,
  getPreferredModalities,
  getRecents,
  sortByAffinity,
  toggleFavourite,
  topAffinityIds,
} from "@/engine/storage";

type OpenFolder =
  | { kind: "signature" }
  | { kind: "premium" }
  | { kind: "folder"; folder: PlayFolder }
  | { kind: "favourites" }
  | null;

export function PlaygroundGallery() {
  const router = useRouter();
  const [favs, setFavs] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState<OpenFolder>(null);
  const [closing, setClosing] = useState(false);
  const [panelKey, setPanelKey] = useState(0);

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

  const closeFolder = useCallback(() => {
    if (!open || closing) return;
    playUiClick();
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setOpen(null);
      return;
    }
    setClosing(true);
  }, [open, closing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFolder();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeFolder]);

  const continueMeta = useMemo(() => {
    if (!ready) return undefined;
    const id = recents[0];
    return id ? getMeta(id) : undefined;
  }, [ready, recents]);

  const favExperiences = useMemo(
    () => favs.map((id) => getMeta(id)).filter(Boolean) as ExperienceMeta[],
    [favs],
  );

  const signature = useMemo(() => signatureExperiences(), []);

  const forYou = useMemo(() => {
    if (!ready) return [];
    // Favourites and recents are the signal that the stored profile changed.
    void favs;
    void recents;
    return topAffinityIds(4)
      .map((id) => getMeta(id))
      .filter((e): e is ExperienceMeta => !!e);
  }, [ready, favs, recents]);

  const folderItems = useMemo(() => {
    void favs;
    void recents;
    return PLAY_FOLDERS.map((folder) => ({
      folder,
      items: ready ? sortByAffinity(experiencesInFolder(folder)) : experiencesInFolder(folder),
    })).filter((f) => f.items.length > 0);
  }, [ready, favs, recents]);

  const openItems: ExperienceMeta[] =
    open?.kind === "favourites"
      ? favExperiences
      : open?.kind === "signature"
        ? sortByAffinity(signature)
        : open?.kind === "folder"
          ? sortByAffinity(experiencesInFolder(open.folder))
          : [];

  const openTitle =
    open?.kind === "favourites"
      ? "Favourites"
      : open?.kind === "signature"
        ? "Signature"
        : open?.kind === "premium"
          ? "Premium"
          : open?.kind === "folder"
            ? open.folder.name
            : "";

  const openKicker =
    open?.kind === "favourites"
      ? "Kept close"
      : open?.kind === "signature"
        ? "Play now"
        : open?.kind === "premium"
          ? "Categories"
          : open?.kind === "folder"
            ? "Premium"
            : "";

  const openAccent =
    open?.kind === "favourites"
      ? "var(--sand)"
      : open?.kind === "signature"
        ? "var(--jade)"
        : open?.kind === "premium"
          ? "var(--sand)"
          : open?.kind === "folder"
            ? open.folder.accent
            : "var(--jade)";

  const loved = forYou.map((e) => e.name);
  const subtitle = !ready
    ? "Signature is ready. Premium goes deeper."
    : loved.length > 0
      ? loved.length === 1
        ? `You keep coming back to ${loved[0]}.`
        : `You keep coming back to ${loved[0]} and ${loved[1]}.`
      : prefs.length > 0
        ? `You lean ${prefs[0].toLowerCase()}. Signature is ready when you are.`
        : "Signature is ready. Premium goes deeper.";

  const surprise = useCallback(() => {
    const pool = signature.filter((exp) => exp.id !== continueMeta?.id);
    const choices = pool.length > 0 ? pool : signature;
    const pick = choices[Math.floor(Math.random() * choices.length)];
    if (!pick) return;
    onExperienceNavClick();
    router.push(`/playground/${pick.id}`);
  }, [signature, continueMeta, router]);

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
                className="inline-flex items-center gap-2.5 font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--ink)] sm:text-4xl"
              >
                <span className="polished-orb header-mark" aria-hidden />
                Palmstone
              </Link>
              <p className="mt-2 max-w-md text-[var(--mist)]">{subtitle}</p>
            </div>
            <div className="gallery-audio">
              <MusicWaveToggle className="sound-wave-btn--gallery" />
              <SfxToggle />
              {favExperiences.length > 0 && (
                <button
                  type="button"
                  className="favourites-link"
                  onClick={() => {
                    playUiClick();
                    setOpen({ kind: "favourites" });
                  }}
                >
                  Favourites
                  <span>{favExperiences.length}</span>
                </button>
              )}
            </div>
          </header>

          <div className="quick-row">
            {continueMeta && (
              <Link
                href={`/playground/${continueMeta.id}`}
                onClick={() => onExperienceNavClick()}
                className="continue-card"
                style={{ borderLeftColor: continueMeta.accent }}
              >
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--fade)]">Continue</p>
                  <p className="mt-1 truncate font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
                    {continueMeta.name}
                  </p>
                </div>
                <span className="text-[var(--jade)]">Play →</span>
              </Link>
            )}
            <button type="button" className="surprise-btn" onClick={surprise}>
              Surprise me
            </button>
          </div>

          <div className="collection-row">
            <button
              type="button"
              className="collection-box"
              onClick={() => {
                playUiClick();
                setOpen({ kind: "signature" });
              }}
            >
              <FolderPreview
                ids={signature.slice(0, 4).map((e) => e.id)}
                tint="color-mix(in oklab, var(--jade) 32%, var(--panel))"
              />
              <span className="collection-box__copy">
                <span className="collection-box__name">Signature</span>
                <span className="collection-box__blurb">
                  {signature.length} experiences, ready to play.
                </span>
              </span>
            </button>

            <button
              type="button"
              className="collection-box collection-box--premium"
              onClick={() => {
                playUiClick();
                setOpen({ kind: "premium" });
              }}
            >
              <FolderPreview
                ids={folderCoverIds(folderItems)}
                tint="color-mix(in oklab, var(--sand) 34%, var(--panel))"
              />
              <span className="collection-box__copy">
                <span className="collection-box__name">Premium</span>
                <span className="collection-box__blurb">Categories inside.</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div
          className={closing ? "folder-sheet folder-sheet--closing" : "folder-sheet"}
          role="dialog"
          aria-modal="true"
          aria-label={openTitle}
        >
          <button
            type="button"
            className="folder-sheet__backdrop"
            aria-label="Close folder"
            onClick={closeFolder}
          />
          <div
            key={panelKey}
            className="folder-sheet__panel"
            style={{ ["--folder-accent" as string]: openAccent }}
            onAnimationEnd={(e) => {
              if (!closing || e.target !== e.currentTarget) return;
              if (e.animationName !== "folder-shrink") return;
              setClosing(false);
              setOpen(null);
            }}
          >
            <div className="folder-sheet__head">
              <div className="min-w-0 flex-1">
                {open.kind === "folder" ? (
                  <button
                    type="button"
                    className="folder-sheet__back"
                    onClick={() => {
                      playUiClick();
                      setOpen({ kind: "premium" });
                    }}
                  >
                    ← Premium
                  </button>
                ) : (
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--fade)]">{openKicker}</p>
                )}
                <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
                  {openTitle}
                </h2>
              </div>
              <button
                type="button"
                className="folder-sheet__close"
                onClick={closeFolder}
              >
                Close
              </button>
            </div>

            {open.kind === "premium" ? (
              <ul className="folder-sheet__list">
                {folderItems.map(({ folder, items }) => (
                  <li key={folder.id}>
                    <button
                      type="button"
                      className="folder-sheet__row"
                      onClick={() => {
                        playUiClick();
                        setPanelKey((key) => key + 1);
                        setOpen({ kind: "folder", folder });
                      }}
                    >
                      <FolderPreview
                        ids={items.slice(0, 4).map((e) => e.id)}
                        tint={`color-mix(in oklab, ${folder.accent} 28%, var(--panel))`}
                        compact
                      />
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
                          {folder.name}
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-[var(--mist)]">
                          {folder.blurb} · {items.length}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
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
                      <ExperienceThumb id={exp.id} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
                          {exp.name}
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-[var(--mist)]">
                          {shortAction(exp.tagline)}
                        </span>
                      </span>
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
            )}
          </div>
        </div>
      )}
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

/** The short action before the dash, which is enough to recognise the toy. */
function shortAction(tagline: string) {
  const head = tagline.split("—")[0]?.trim() || tagline;
  if (head.length < tagline.trim().length) return head.replace(/\.$/, "");
  const sentence = head.split(".")[0]?.trim() || head;
  const words = sentence.split(/\s+/);
  return words.length <= 4 ? sentence : words.slice(0, 3).join(" ");
}

function folderCoverIds(groups: { items: ExperienceMeta[] }[]): ExperienceId[] {
  const picked: ExperienceMeta[] = [];
  const seen = new Set<string>();
  const take = (item: ExperienceMeta | undefined) => {
    if (!item || seen.has(item.id) || picked.length >= 4) return;
    seen.add(item.id);
    picked.push(item);
  };
  for (const group of groups) take(group.items[0]);
  for (const group of groups) {
    for (const item of group.items) take(item);
  }
  return picked.map((item) => item.id);
}

function FolderPreview({
  ids,
  tint,
  compact = false,
}: {
  ids: ExperienceId[];
  tint: string;
  compact?: boolean;
}) {
  const cells = [0, 1, 2, 3].map((i) => ids[i]);
  return (
    <div
      className={compact ? "folder-preview folder-preview--mini" : "folder-preview"}
      style={{ background: tint }}
    >
      {cells.map((id, i) =>
        id ? (
          <ExperienceThumb key={id} id={id} />
        ) : (
          <span key={i} className="folder-preview__cell" />
        ),
      )}
    </div>
  );
}
