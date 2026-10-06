"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ExperienceThumb } from "@/components/ExperienceThumb";
import { navigateWithCoverWipe } from "@/components/PageRevealWipe";
import { playUiClick } from "@/components/SiteAudio";
import { getMeta } from "@/engine/catalog";
import { NEED_DEFAULT_MINUTES, NEED_LABELS, type Need } from "@/engine/needs";
import { topRecommendation } from "@/engine/recommend";
import { setLastNeed } from "@/engine/storage";
import type { ExperienceId, ExperienceMeta } from "@/engine/types";

const MOODS: Exclude<Need, "explore">[] = ["settle", "focus", "stimulate", "hands"];

const NEED_THUMBS: Record<Exclude<Need, "explore">, ExperienceId> = {
  settle: "sand-tray",
  focus: "silk-fluid",
  stimulate: "keyboard-thock",
  hands: "fidget-cube",
};

const NEED_LINES: Record<Exclude<Need, "explore">, string> = {
  settle: "Slow the edges",
  focus: "A quiet loop",
  stimulate: "Something that answers back",
  hands: "Keep your fingers occupied",
};

type Props = {
  title?: string;
  onPick?: (need: Need) => void;
};

export function NeedPicker({ title = "What do you need?", onPick }: Props) {
  const router = useRouter();
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const [thumbs, setThumbs] = useState<Partial<Record<Need, ExperienceMeta | undefined>>>(() => {
    const map: Partial<Record<Need, ExperienceMeta | undefined>> = {};
    for (const need of MOODS) {
      map[need] = getMeta(NEED_THUMBS[need]);
    }
    return map;
  });

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const map: Partial<Record<Need, ExperienceMeta | undefined>> = {};
      for (const need of MOODS) {
        map[need] = topRecommendation(need) ?? getMeta(NEED_THUMBS[need]);
      }
      setThumbs(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = (need: Exclude<Need, "explore">) => {
    playUiClick();
    setLastNeed(need);
    onPick?.(need);
    const meta = thumbs[need] ?? getMeta(NEED_THUMBS[need]);
    navigateWithCoverWipe(router, `${base}/playground/?need=${need}`, meta?.accent);
  };

  return (
    <section className="need-picker" aria-labelledby="need-picker-title">
      <h2 id="need-picker-title" className="need-picker__title need-enter">
        {title}
      </h2>
      <p className="need-picker__note need-enter" style={{ ["--need-i" as string]: 1 }}>
        Pick a mood. We&apos;ll suggest a few stones and a short session.
      </p>
      <div className="need-picker__rows" role="group" aria-label="What you need right now">
        {MOODS.map((need, index) => {
          const meta = thumbs[need];
          const minutes = NEED_DEFAULT_MINUTES[need];
          return (
            <button
              key={need}
              type="button"
              className="need-row need-enter"
              style={{ ["--need-i" as string]: index + 2 }}
              onClick={() => choose(need)}
              aria-label={`${NEED_LABELS[need]}, ${NEED_LINES[need]}, about ${minutes} minutes`}
            >
              <span className="need-row__face tray-stone__face" aria-hidden>
                {meta ? <ExperienceThumb id={meta.id} /> : null}
              </span>
              <span className="need-row__copy">
                <span className="need-row__label">{NEED_LABELS[need]}</span>
                <span className="need-row__line">{NEED_LINES[need]}</span>
              </span>
              <span className="need-row__mins">{minutes} min</span>
            </button>
          );
        })}
      </div>
      <Link
        href={`${base}/playground/`}
        onClick={() => playUiClick()}
        className="need-picker__explore need-enter"
        style={{ ["--need-i" as string]: MOODS.length + 2 }}
      >
        Explore the tray
      </Link>
    </section>
  );
}
