"use client";

import { useRouter } from "next/navigation";
import { ExperiencePickTile } from "@/components/ExperiencePickTile";
import { navigateWithCoverWipe } from "@/components/PageRevealWipe";
import { onExperienceNavClick } from "@/components/SiteAudio";
import { getMeta } from "@/engine/catalog";
import type { ExperienceId } from "@/engine/types";

const FLAGSHIPS: ExperienceId[] = [
  "mesh-lattice",
  "infinite-garden",
  "silk-fluid",
  "sand-tray",
];

/** First-viewport stones — tap puts one in the hand immediately. */
export function LandingShowcase() {
  const router = useRouter();
  const items = FLAGSHIPS.map((id) => getMeta(id)).filter(
    (m): m is NonNullable<typeof m> => !!m,
  );

  return (
    <section className="landing-showcase" aria-labelledby="landing-showcase-title">
      <h2 id="landing-showcase-title" className="landing-showcase__title">
        Try one
      </h2>
      <div className="landing-showcase__row">
        {items.map((meta) => (
          <ExperiencePickTile
            key={meta.id}
            meta={meta}
            size="hero"
            onClick={() => {
              onExperienceNavClick();
              navigateWithCoverWipe(router, `/playground/${meta.id}/`, meta.accent);
            }}
          />
        ))}
      </div>
    </section>
  );
}
