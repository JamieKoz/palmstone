import type { Application, Container } from "pixi.js";

export type ExperienceId =
  | "sand-tray"
  | "silk-fluid"
  | "magnetic-field"
  | "gear-mesh"
  | "orbit-beads"
  | "elastic-web"
  | "pulse-pads"
  | "stone-polish"
  | "ripple-pool"
  | "slider-loom";

export interface AudioBus {
  resume(): Promise<void>;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  /** Soft noise burst / scrape. intensity 0–1 */
  grain(intensity?: number, pitch?: number): void;
  /** Soft whoosh / fluid. */
  whoosh(intensity?: number): void;
  /** Soft click / tick. */
  click(intensity?: number, pitch?: number): void;
  /** Low thump / pulse. */
  pulse(intensity?: number): void;
  /** Soft tone / bloom. */
  tone(freq?: number, intensity?: number, duration?: number): void;
  destroy(): void;
}

export interface HapticsBus {
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  /** Short vibes; no-ops when unsupported or disabled. */
  tap(ms?: number): void;
  pattern(pattern: number[]): void;
}

export interface ExperienceContext {
  app: Application;
  root: Container;
  width: number;
  height: number;
  audio: AudioBus;
  haptics: HapticsBus;
  muted: () => boolean;
  hapticsEnabled: () => boolean;
}

export interface ExperienceHandle {
  update?(dt: number): void;
  resize?(width: number, height: number): void;
  destroy(): void;
}

export interface ExperienceMeta {
  id: ExperienceId;
  name: string;
  modality: string;
  tagline: string;
  hint: string;
  /** Accent used in gallery chrome */
  accent: string;
}

export interface ExperienceModule extends ExperienceMeta {
  mount(ctx: ExperienceContext): ExperienceHandle | Promise<ExperienceHandle>;
}
