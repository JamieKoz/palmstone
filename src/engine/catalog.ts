import type { ExperienceId, ExperienceMeta } from "./types";

/** Pure metadata — safe for server components / SSR. */
export const CATALOG: ExperienceMeta[] = [
  {
    id: "mesh-lattice",
    name: "Mesh Lattice",
    modality: "WebGL",
    tagline: "Perspective audio mesh — music-reactive lattice you can warp.",
    hint: "Drag to warp. Generative music drives the grid (mute-safe).",
    accent: "#6db8b0",
    badge: "WebGL",
  },
  {
    id: "aurora-veil",
    name: "Aurora Veil",
    modality: "WebGL",
    tagline: "Full-screen shader veil — soft bands that breathe with sound.",
    hint: "Touch to bloom. Generative music shapes the field.",
    accent: "#8fbc8f",
    badge: "WebGL",
  },
  {
    id: "sand-tray",
    name: "Sand Tray",
    modality: "Granular",
    tagline: "Pour, rake, pile — grain weight under the thumb.",
    hint: "Drag to rake. Use Pour for continuous fall, Reset to refill.",
    accent: "#c4a574",
  },
  {
    id: "silk-fluid",
    name: "Silk Fluid",
    modality: "Fluid",
    tagline: "Viscous pour and swirl — color that bleeds slowly.",
    hint: "Drag slowly to pour. Flick to swirl.",
    accent: "#6db3a8",
  },
  {
    id: "ripple-pool",
    name: "Ripple Pool",
    modality: "Fluid",
    tagline: "Touch ripples — overlapping waves that interfere.",
    hint: "Tap or hold to send ripples.",
    accent: "#6a9fb5",
  },
  {
    id: "elastic-web",
    name: "Elastic Web",
    modality: "Elastic",
    tagline: "Pull nodes — spring-back and harmonic wobble.",
    hint: "Grab a node and pull. Release to watch it settle.",
    accent: "#c9a66b",
  },
  {
    id: "magnetic-field",
    name: "Magnetic Field",
    modality: "Force",
    tagline: "Drag attract and repel wells through a field of particles.",
    hint: "Drag wells. Gravity slider scales the field. Double-tap to place another.",
    accent: "#7eb6c9",
  },
  {
    id: "gear-mesh",
    name: "Gear Mesh",
    modality: "Mechanical",
    tagline: "Interlocking gears — spin cascade, soft click.",
    hint: "Drag a gear to spin the mesh.",
    accent: "#c4b08a",
  },
  {
    id: "orbit-beads",
    name: "Orbit Beads",
    modality: "Spatial",
    tagline: "Fling beads into stable orbits around gravity wells.",
    hint: "Drag and fling a bead. Use Gravity to pull harder.",
    accent: "#8aa4c8",
  },
  {
    id: "pulse-pads",
    name: "Pulse Pads",
    modality: "Rhythm",
    tagline: "Tap pads — visual bloom and optional vibe.",
    hint: "Tap any pad. Sound and haptics follow.",
    accent: "#8fbc8f",
  },
  {
    id: "stone-polish",
    name: "Stone Polish",
    modality: "Texture",
    tagline: "Rub the surface smooth — sheen rises, friction falls.",
    hint: "Rub in strokes. Watch the stone take a polish.",
    accent: "#a89a84",
  },
  {
    id: "slider-loom",
    name: "Slider Loom",
    modality: "Mechanical",
    tagline: "Multi-slider weave — snap points and soft resistance.",
    hint: "Slide each bar. Watch the weave angles shift.",
    accent: "#8fa894",
  },
];

export function getMeta(id: string): ExperienceMeta | undefined {
  return CATALOG.find((e) => e.id === id);
}

export function isExperienceId(id: string): id is ExperienceId {
  return CATALOG.some((e) => e.id === id);
}

export const MODALITIES = Array.from(new Set(CATALOG.map((e) => e.modality)));
