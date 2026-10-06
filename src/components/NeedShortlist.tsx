"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import { ExperienceIdentity } from "@/components/ExperienceIdentity";
import { navigateWithCoverWipe, resumeCoverWipe } from "@/components/PageRevealWipe";
import { onExperienceNavClick, playUiClick } from "@/components/SiteAudio";
import { getMeta } from "@/engine/catalog";
import { NEED_DEFAULT_MINUTES, NEED_LABELS, type Need } from "@/engine/needs";
import { recommendForNeed } from "@/engine/recommend";
import { setLastNeed } from "@/engine/storage";
import type { ExperienceMeta } from "@/engine/types";

type Props = {
  need: Exclude<Need, "explore">;
};

export function NeedShortlist({ need }: Props) {
  const router = useRouter();
  const minutes = NEED_DEFAULT_MINUTES[need];
  const [items, setItems] = useState<ExperienceMeta[]>([]);

  // Shell stays mounted across need→shortlist; resume the wipe here.
  useLayoutEffect(() => {
    resumeCoverWipe();
  }, [need]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setItems(recommendForNeed(need, 4));
    });
    return () => {
      cancelled = true;
    };
  }, [need]);

  const begin = (id: string) => {
    setLastNeed(need);
    onExperienceNavClick();
    navigateWithCoverWipe(
      router,
      `/playground/${id}/?need=${need}&session=${minutes}`,
      getMeta(id)?.accent,
    );
  };

  return (
    <section className="need-shortlist" aria-labelledby="need-shortlist-title">
      <div className="need-shortlist__head need-enter">
        <div className="need-shortlist__nav">
          <Link
            href="/playground/?need=ask"
            onClick={() => playUiClick()}
            className="need-shortlist__back"
          >
            ← What do you need?
          </Link>
          <Link href="/" onClick={() => playUiClick()} className="nav-home">
            Home
          </Link>
        </div>
        <h2 id="need-shortlist-title" className="need-shortlist__title">
          {NEED_LABELS[need]}
        </h2>
        <p className="need-shortlist__note">About {minutes} minutes. Pick one that fits.</p>
      </div>
      <div className="need-shortlist__list">
        {items.map((meta, index) => (
          <div
            key={meta.id}
            className="need-enter"
            style={{ ["--need-i" as string]: index + 1 }}
          >
            <ExperienceIdentity
              meta={meta}
              sessionMinutes={minutes}
              onBegin={() => begin(meta.id)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
