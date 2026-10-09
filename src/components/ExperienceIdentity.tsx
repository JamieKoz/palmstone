"use client";

import { ExperienceThumb } from "@/components/ExperienceThumb";
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

function sensoryChips(meta: ExperienceMeta): string[] {
  const chips: string[] = [];
  if (meta.layer === "world") chips.push(meta.infinite ? "Keeps going" : "World");
  else if (meta.layer === "environment") chips.push("Place");
  else chips.push("Object");
  chips.push(meta.speed === "slow" ? "Slow" : meta.speed === "fast" ? "Fast" : "Steady");
  chips.push(
    meta.predictability === "high"
      ? "Predictable"
      : meta.predictability === "low"
        ? "Chaotic"
        : "Open",
  );
  chips.push(meta.cognitive === "low" ? "Mindless" : meta.cognitive === "high" ? "Engaging" : "Steady mind");
  if (meta.sensory.control >= 3) chips.push("Hands-on");
  return chips;
}

export function ExperienceIdentity({ meta, sessionMinutes, onBegin }: Props) {
  const chips = sensoryChips(meta);
  const ariaLabel = `${meta.name}. ${meta.feel}. ${chips.join(", ")}${
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
        <span className="identity-pick__sensory">
          <SensoryMeter label="Visual" level={meta.sensory.visual} />
          <SensoryMeter label="Sound" level={meta.sensory.audio} />
          <SensoryMeter label="Touch" level={meta.sensory.haptic} />
        </span>
        <span className="identity-pick__chips">
          {chips.map((chip) => (
            <span key={chip}>{chip}</span>
          ))}
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
