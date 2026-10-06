"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AddToHome } from "@/components/AddToHome";
import { ExperiencePickTile } from "@/components/ExperiencePickTile";
import { ExperienceThumb } from "@/components/ExperienceThumb";
import { SoundLevelToggle } from "@/components/SoundLevelToggle";
import { navigateWithCoverWipe, PageRevealWipe } from "@/components/PageRevealWipe";
import { onExperienceNavClick, playUiClick } from "@/components/SiteAudio";
import { TRAY_GROUPS, experiencesInGroup, getMeta } from "@/engine/catalog";
import { recommendForYou } from "@/engine/recommend";
import {
  getFavourites,
  getRecents,
  hasStrongAffinity,
  topAffinityIds,
} from "@/engine/storage";
import type { ExperienceMeta } from "@/engine/types";

const base = () => process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function PlaygroundGallery() {
  const router = useRouter();
  const pressId = useRef<string | null>(null);

  const [favs, setFavs] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [forYou, setForYou] = useState<ExperienceMeta[]>([]);
  const [lovedNames, setLovedNames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setFavs(getFavourites());
      setRecents(getRecents());
      setForYou(recommendForYou(3));
      setLovedNames(
        topAffinityIds(2)
          .map((id) => getMeta(id)?.name)
          .filter((name): name is string => !!name),
      );
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = TRAY_GROUPS.map((group) => ({
    group,
    items: experiencesInGroup(group),
  }));

  const continueMeta = ready && recents[0] ? getMeta(recents[0]) : undefined;

  const subtitle = !ready
    ? "Brush a stone. Press to settle."
    : lovedNames.length === 1
      ? `You keep coming back to ${lovedNames[0]}.`
      : lovedNames.length > 1
        ? `You keep coming back to ${lovedNames[0]} and ${lovedNames[1]}.`
        : "Brush a stone. Press to settle.";

  const settle = useCallback(
    (exp: ExperienceMeta) => {
      onExperienceNavClick();
      navigateWithCoverWipe(router, `${base()}/playground/${exp.id}/`, exp.accent);
    },
    [router],
  );

  const favouriteMetas = ready
    ? favs
        .map((id) => getMeta(id))
        .filter((m): m is ExperienceMeta => !!m)
    : [];

  // Hide For you until affinity is real, and skip stones already in favourites / continue.
  const forYouVisible =
    ready &&
    forYou.filter((exp) => {
      if (favs.includes(exp.id)) return false;
      if (continueMeta?.id === exp.id) return false;
      return hasStrongAffinity(exp.id);
    }).slice(0, 3);

  return (
    <>
      <div className="relative min-h-dvh overflow-x-hidden">
        <PageRevealWipe />
        <div className="atmosphere" aria-hidden />
        <div className="grain-overlay" aria-hidden />

        <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-8 sm:pt-12">
          <header className="gallery-header mb-6 sm:mb-8">
            <div className="gallery-header__top">
              <Link href={`${base()}/`} onClick={() => playUiClick()} className="gallery-header__brand">
                <span className="polished-orb header-mark" aria-hidden />
                Palmstone
              </Link>
              <SoundLevelToggle variant="wave" className="sound-wave-btn--gallery" />
            </div>
            <p className="gallery-header__subtitle">{subtitle}</p>
            <div className="gallery-header__actions">
              {continueMeta && (
                <Link
                  href={`${base()}/playground/${continueMeta.id}/`}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    settle(continueMeta);
                  }}
                  className="btn-primary btn-primary--sm"
                >
                  Continue {continueMeta.name}
                </Link>
              )}
              <Link
                href={`${base()}/playground/?need=ask`}
                onClick={() => playUiClick()}
                className="gallery-find-btn"
              >
                What do you need?
              </Link>
              <AddToHome />
            </div>
          </header>

          {favouriteMetas.length > 0 && (
            <section className="gallery-section" aria-label="Kept">
              <h2 className="gallery-section__title">Kept</h2>
              <div className="pick-row">
                {favouriteMetas.map((exp) => (
                  <ExperiencePickTile
                    key={exp.id}
                    meta={exp}
                    badge="♡"
                    onClick={() => settle(exp)}
                  />
                ))}
              </div>
            </section>
          )}

          {forYouVisible && forYouVisible.length > 0 && (
            <section className="gallery-section" aria-label="For you">
              <h2 className="gallery-section__title">For you</h2>
              <div className="pick-row">
                {forYouVisible.map((exp) => (
                  <ExperiencePickTile key={exp.id} meta={exp} onClick={() => settle(exp)} />
                ))}
              </div>
            </section>
          )}

          <div className="tray">
            {groups.map(({ group, items }) => (
              <section key={group.id} className="tray-group" aria-label={group.name}>
                <h2 className="tray-group__name">{group.name}</h2>
                <div className="tray-group__stones">
                  {items.map((exp) => {
                    const kept = favs.includes(exp.id);
                    return (
                      <button
                        key={exp.id}
                        type="button"
                        className={["tray-stone", kept ? "is-kept" : ""].filter(Boolean).join(" ")}
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
      </div>
    </>
  );
}
