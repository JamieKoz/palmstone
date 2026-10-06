"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExperienceThumb } from "@/components/ExperienceThumb";
import { playUiClick } from "@/components/SiteAudio";
import { getMeta } from "@/engine/catalog";
import { NEED_DEFAULT_MINUTES, NEEDS, NEED_LABELS, type Need } from "@/engine/needs";
import { topRecommendation } from "@/engine/recommend";
import { setLastNeed } from "@/engine/storage";
import type { ExperienceId, ExperienceMeta } from "@/engine/types";

const EXPLORE_CLUSTER: ExperienceId[] = ["silk-fluid", "sand-tray", "keyboard-thock"];

const NEED_THUMBS: Record<Exclude<Need, "explore">, ExperienceId> = {
  settle: "sand-tray",
  focus: "silk-fluid",
  stimulate: "keyboard-thock",
  hands: "fidget-cube",
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
    for (const need of NEEDS) {
      if (need === "explore") continue;
      map[need] = getMeta(NEED_THUMBS[need]);
    }
    return map;
  });

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const map: Partial<Record<Need, ExperienceMeta | undefined>> = {};
      for (const need of NEEDS) {
        if (need === "explore") continue;
        map[need] = topRecommendation(need) ?? getMeta(NEED_THUMBS[need]);
      }
      setThumbs(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = (need: Need) => {
    playUiClick();
    setLastNeed(need);
    onPick?.(need);
    if (need === "explore") {
      router.push(`${base}/playground/`);
      return;
    }
    router.push(`${base}/playground/?need=${need}`);
  };

  return (
    <section className="need-picker" aria-labelledby="need-picker-title">
      <h2 id="need-picker-title" className="need-picker__title">
        {title}
      </h2>
      <p className="need-picker__note">
        Pick a mood. We&apos;ll suggest a few stones and a short session.
      </p>
      <div className="need-picker__icons" role="group" aria-label="What you need right now">
        {NEEDS.map((need) => {
          if (need === "explore") {
            return (
              <button
                key={need}
                type="button"
                className="need-icon need-icon--explore"
                onClick={() => choose(need)}
                aria-label="Explore all experiences"
              >
                <span className="need-icon__cluster" aria-hidden>
                  {EXPLORE_CLUSTER.map((id) => (
                    <span key={id} className="need-icon__cluster-face tray-stone__face">
                      <ExperienceThumb id={id} />
                    </span>
                  ))}
                </span>
                <span className="need-icon__label">{NEED_LABELS[need]}</span>
              </button>
            );
          }

          const meta = thumbs[need];
          const minutes = NEED_DEFAULT_MINUTES[need];
          return (
            <button
              key={need}
              type="button"
              className={`need-icon need-icon--${need}`}
              onClick={() => choose(need)}
              aria-label={`${NEED_LABELS[need]}, about ${minutes} minutes`}
            >
              <span className="need-icon__face tray-stone__face" aria-hidden>
                {meta ? <ExperienceThumb id={meta.id} /> : null}
              </span>
              <span className="need-icon__label">{NEED_LABELS[need]}</span>
              <span className="need-icon__mins">{minutes} min</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
