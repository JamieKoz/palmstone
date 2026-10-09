"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { navigateWithCoverWipe } from "@/components/PageRevealWipe";
import { onExperienceNavClick, playUiClick } from "@/components/SiteAudio";
import { getMeta } from "@/engine/catalog";
import { getReturnCue } from "@/engine/recommend";
import { getRecents } from "@/engine/storage";

/** Primary door: what do you need? Continue / explore stay secondary. */
export function LandingCTA() {
  const router = useRouter();
  const [continueId, setContinueId] = useState<string | null>(null);
  const [continueMeta, setContinueMeta] = useState<ReturnType<typeof getMeta>>(undefined);
  const [returnLine, setReturnLine] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const [last] = getRecents();
      if (last) {
        const meta = getMeta(last);
        if (meta) {
          setContinueId(meta.id);
          setContinueMeta(meta);
        }
      }
      const cue = getReturnCue();
      if (cue && last) setReturnLine(cue.line);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="hero-cta">
      <div className="hero-actions">
        <Link href="/playground/?need=ask" onClick={() => playUiClick()} className="btn-primary">
          Enter
          <span aria-hidden>→</span>
        </Link>
        {continueMeta && continueId ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              onExperienceNavClick();
              navigateWithCoverWipe(
                router,
                `/playground/${continueId}/`,
                continueMeta.accent,
              );
            }}
          >
            Continue {continueMeta.name}
          </button>
        ) : (
          <Link href="/playground/" onClick={() => playUiClick()} className="btn-secondary">
            Explore
          </Link>
        )}
      </div>
      {returnLine ? (
        <div className="hero-foot">
          <p className="hero-return">{returnLine}</p>
        </div>
      ) : null}
    </div>
  );
}
