"use client";

import { ExperienceThumb } from "@/components/ExperienceThumb";
import { NEED_LABELS, type Need } from "@/engine/needs";
import type { ExperienceMeta, SensoryLevel } from "@/engine/types";

function SensoryMeter({ label, level }: { label: string; level: SensoryLevel }) {
  return (
    <span className="sensory-meter" aria-hidden>
      <span className="sensory-meter__label">{label}</span>
      <span className="sensory-meter__bars">
        {[1, 2, 3].map((step) => (
          <span key={step} className={step <= level ? "is-on" : ""} />
        ))}
      </span>
    </span>
  );
}

type Props = {
  meta: ExperienceMeta;
  sessionMinutes?: number;
  onBegin: () => void;
};

export function ExperienceIdentity({ meta, sessionMinutes, onBegin }: Props) {
  const bestFor = meta.needs.filter((n) => n !== "explore").map((n) => NEED_LABELS[n as Need]);
  const ariaLabel = `${meta.name}. ${meta.feel}${
    sessionMinutes != null ? `. About ${sessionMinutes} minutes.` : ""
  }`;

  return (
    <button type="button" className="identity-pick" onClick={onBegin} aria-label={ariaLabel}>
      <span className="identity-pick__face tray-stone__face" aria-hidden>
        <ExperienceThumb id={meta.id} />
      </span>
      <span className="identity-pick__body">
        <span className="identity-pick__name">{meta.name}</span>
        <span className="identity-pick__feel">{meta.feel}</span>
        {bestFor.length > 0 && (
          <span className="identity-pick__best">Best for: {bestFor.join(" · ")}</span>
        )}
        <span className="identity-pick__sensory">
          <SensoryMeter label="Visual" level={meta.sensory.visual} />
          <SensoryMeter label="Sound" level={meta.sensory.audio} />
          <SensoryMeter label="Touch" level={meta.sensory.haptic} />
        </span>
        {meta.hapticBest ? <span className="identity-pick__haptic">Best with haptics</span> : null}
        <span className="identity-pick__cta">
          {sessionMinutes != null ? `Begin · ${sessionMinutes} min` : "Press to begin"}
          <span aria-hidden> →</span>
        </span>
      </span>
    </button>
  );
}
