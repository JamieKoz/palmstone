"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AddToHome } from "@/components/AddToHome";
import { navigateWithCoverWipe } from "@/components/PageRevealWipe";
import { onExperienceNavClick, playUiClick } from "@/components/SiteAudio";
import { getMeta } from "@/engine/catalog";
import { getRecents } from "@/engine/storage";

/** Primary door: what do you need? Continue / explore stay secondary. */
export function LandingCTA() {
  const router = useRouter();
  const [continueId, setContinueId] = useState<string | null>(null);
  const [continueMeta, setContinueMeta] = useState<ReturnType<typeof getMeta>>(undefined);

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
            Explore the tray
          </Link>
        )}
      </div>
      <div className="hero-foot">
        <AddToHome />
        <p className="hero-foot__privacy">Your preferences stay on this device.</p>
      </div>
    </div>
  );
}
