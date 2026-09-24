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
  | "slider-loom"
  | "mesh-lattice"
  | "aurora-veil"
  | "pen-clicker"
  | "light-switch"
  | "keyboard-thock"
  | "mouse-click"
  | "big-button"
  | "bubble-wrap"
  | "fidget-cube"
  | "fidget-spinner"
  | "zipper"
  | "lamp-toggle";

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
  /** Bongo-like membrane hit (Pulse Pads). */
  bongo(freq: number, intensity?: number): void;
  /** Chunky keyboard bottom-out. */
  thock(intensity?: number, pitch?: number): void;
  /** Satisfying bubble-wrap membrane pop. */
  pop(intensity?: number, pitch?: number): void;
  /** Retractable pen: press-in vs spring-back click. */
  penClick(phase: "down" | "up", intensity?: number): void;
  /** Wall light-switch paddle snap. */
  switchClick(on: boolean, intensity?: number): void;
  /** Zipper tooth tick — short bite synced to movement, not a full sample. */
  zip(intensity?: number, pitch?: number, direction?: "open" | "close"): void;
  /** @deprecated no-op kept for callers; zip is one-shot now. */
  stopZip(): void;
  /** Rubber / elastic stretch scrape. pitch rises with tension. */
  elastic(intensity?: number, pitch?: number): void;
  /** Elastic snap-back when a stretched node is released. */
  elasticRelease(intensity?: number, pitch?: number): void;
  /** Deep arcade / fidget big-button press (down) or release (up). */
  buttonPress(phase?: "down" | "up", intensity?: number): void;
  /** Optical mouse button click. */
  mouseClick(intensity?: number, pitch?: number): void;
  /** Pull-cord lamp toggle (on / off use distinct recorded snaps). */
  lampToggle(on: boolean, intensity?: number): void;
  /** Soft water stir while dragging a fluid surface. */
  water(intensity?: number): void;
  /**
   * Start a looping generative ambient bed (for audio-reactive visuals).
   * Safe to call repeatedly; no-ops when muted until unmuted.
   */
  startBed(style?: "lattice" | "aurora" | "peace"): void;
  stopBed(): void;
  /** Fill `out` with 0–1 band energies (length used as bin count). */
  getSpectrum(out: Float32Array): void;
  /** Smoothed bass energy 0–1 */
  getBass(): number;
  destroy(): void;
}

export interface HapticsBus {
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
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
  host: HTMLElement;
}

export interface WebGLExperienceContext {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  width: number;
  height: number;
  audio: AudioBus;
  haptics: HapticsBus;
  muted: () => boolean;
  hapticsEnabled: () => boolean;
  host: HTMLElement;
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
  accent: string;
  /** Optional badge in gallery — e.g. WebGL */
  badge?: string;
}

export interface PixiExperienceModule extends ExperienceMeta {
  kind?: "pixi";
  mount(ctx: ExperienceContext): ExperienceHandle | Promise<ExperienceHandle>;
}

export interface WebGLExperienceModule extends ExperienceMeta {
  kind: "webgl";
  mount(ctx: WebGLExperienceContext): ExperienceHandle | Promise<ExperienceHandle>;
}

export type ExperienceModule = PixiExperienceModule | WebGLExperienceModule;
