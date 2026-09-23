"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { playUiClick } from "@/components/SiteAudio";
import { getMeta } from "@/engine/catalog";
import { getPreferredModalities, getRecents } from "@/engine/storage";

/** Soft Phase 1: pick up where you left off (local). */
export function LandingCTA() {
  const [continueId, setContinueId] = useState<string | null>(null);
  const [continueName, setContinueName] = useState<string | null>(null);
  const [vibeLine, setVibeLine] = useState<string | null>(null);

  useEffect(() => {
    const [last] = getRecents();
    if (last) {
      const meta = getMeta(last);
      if (meta) {
        setContinueId(meta.id);
        setContinueName(meta.name);
      }
    }
    const prefs = getPreferredModalities(2);
    if (prefs.length > 0) {
      setVibeLine(
        prefs.length === 1
          ? `You linger in ${prefs[0].toLowerCase()} feels.`
          : `You lean toward ${prefs[0].toLowerCase()} and ${prefs[1].toLowerCase()}.`,
      );
    }
  }, []);

  return (
    <div className="hero-cta mt-10 flex flex-col items-start gap-4">
      {vibeLine && <p className="text-sm text-[var(--fade)]">{vibeLine}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {continueId ? (
          <>
            <Link
              href={`/playground/${continueId}`}
              onClick={() => playUiClick()}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--jade)] px-7 py-3.5 text-base font-medium text-[var(--bg)] transition hover:brightness-110 active:scale-[0.98]"
            >
              Continue {continueName}
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="/playground"
              onClick={() => playUiClick()}
              className="inline-flex items-center gap-2 rounded-full px-5 py-3.5 text-base text-[var(--mist)] transition hover:text-[var(--ink)]"
            >
              Browse all
            </Link>
          </>
        ) : (
          <Link
            href="/playground"
            onClick={() => playUiClick()}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--jade)] px-7 py-3.5 text-base font-medium text-[var(--bg)] transition hover:brightness-110 active:scale-[0.98]"
          >
            Enter playground
            <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    </div>
  );
}
