"use client";

import { ExperienceThumb } from "@/components/ExperienceThumb";
import type { ExperienceMeta } from "@/engine/types";

type Props = {
  meta: ExperienceMeta;
  onClick: () => void;
  kept?: boolean;
  compact?: boolean;
  /** Large brochure / shortlist tiles. */
  size?: "default" | "compact" | "large" | "hero";
};

/** Filled favourite mark — overlay on a full-size stone, never shrinks the art. */
export function StoneHeart() {
  return (
    <span className="stone-heart" aria-hidden>
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path
          fill="currentColor"
          d="M12.1 21.35 10.55 19.95C5.4 15.36 2 12.27 2 8.5 2 5.41 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.08C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.41 22 8.5c0 3.77-3.4 6.86-8.55 11.45z"
        />
      </svg>
    </span>
  );
}

/** App-icon style tile — same visual language as the stone tray. */
export function ExperiencePickTile({ meta, onClick, kept, compact, size }: Props) {
  const resolved =
    size ?? (compact ? "compact" : "default");

  return (
    <button
      type="button"
      className={["pick-tile", `pick-tile--${resolved}`, kept ? "is-kept" : ""]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      aria-label={kept ? `${meta.name}, favourite` : meta.name}
    >
      <span className="pick-tile__face tray-stone__face">
        <ExperienceThumb id={meta.id} />
        {kept ? <StoneHeart /> : null}
      </span>
      <span className="pick-tile__name tray-stone__name">{meta.name}</span>
    </button>
  );
}
