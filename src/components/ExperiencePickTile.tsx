"use client";

import { ExperienceThumb } from "@/components/ExperienceThumb";
import type { ExperienceMeta } from "@/engine/types";

type Props = {
  meta: ExperienceMeta;
  onClick: () => void;
  badge?: string;
  compact?: boolean;
  /** Large brochure / shortlist tiles. */
  size?: "default" | "compact" | "large" | "hero";
};

/** App-icon style tile — same visual language as the stone tray. */
export function ExperiencePickTile({ meta, onClick, badge, compact, size }: Props) {
  const resolved =
    size ?? (compact ? "compact" : "default");

  return (
    <button
      type="button"
      className={["pick-tile", `pick-tile--${resolved}`].join(" ")}
      onClick={onClick}
      aria-label={meta.name}
    >
      <span className="pick-tile__face tray-stone__face">
        <ExperienceThumb id={meta.id} />
        {badge ? <span className="pick-tile__badge">{badge}</span> : null}
      </span>
      <span className="pick-tile__name tray-stone__name">{meta.name}</span>
    </button>
  );
}
