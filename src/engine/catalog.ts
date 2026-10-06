import { applyProfile } from "./profiles";
import type { ExperienceId, ExperienceMeta, ExperienceMetaCore } from "./types";

const CATALOG_BASE = [
  {
    id: "mesh-lattice",
    name: "Mesh Lattice",
    collection: "field",
    modality: "WebGL",
    tagline: "Fidget with the lattice while a song moves through it.",
    hint: "Search a song for a 30s preview, or drag to orbit. Best with sound on.",
    accent: "#6db8b0",
    badge: "WebGL",
  },
  {
    id: "sand-tray",
    name: "Sand Tray",
    collection: "studio",
    modality: "Granular",
    tagline: "Pour, rake, pile — grain weight under the thumb.",
    hint: "Sand falls into the tray. Drag to rake. Pour starts on.",
    accent: "#c4a574",
    badge: "WebGL",
  },
  {
    id: "silk-fluid",
    name: "Silk Fluid",
    collection: "field",
    modality: "Fluid",
    tagline: "Drag colorful dye through a living fluid field.",
    hint: "Drag to splash and swirl. Colors bloom as they flow.",
    accent: "#6db3a8",
    badge: "WebGL",
  },
  {
    id: "ripple-pool",
    name: "Ripple Pool",
    collection: "studio",
    modality: "Fluid",
    tagline: "Drag the surface — real water refraction and wake.",
    hint: "Drag the water to push the fish. Press for deeper drops.",
    accent: "#6a9fb5",
    badge: "WebGL",
  },
  {
    id: "elastic-web",
    name: "Elastic Web",
    collection: "field",
    modality: "Elastic",
    tagline: "Pull nodes — spring-back and harmonic wobble.",
    hint: "Grab a node and pull. Release to watch it settle.",
    accent: "#c9a66b",
  },
  {
    id: "magnetic-field",
    name: "Magnetic Field",
    collection: "field",
    modality: "Force",
    tagline: "Drag the magnets — filings cling to one pole and flee the other.",
    hint: "Drag a disc, or the empty space. Pull sets how hard the field grabs. Double-tap to flip a pole.",
    accent: "#7eb6c9",
  },
  {
    id: "gear-mesh",
    name: "Gear Mesh",
    collection: "field",
    modality: "Mechanical",
    tagline: "Turn a crank — teeth mesh, nuts jam, and grind.",
    hint: "Grab a pale crank or the gear body. Nuts fall into the teeth — spin to grind them.",
    accent: "#c4b08a",
  },
  {
    id: "orbit-beads",
    name: "Orbit Beads",
    collection: "studio",
    modality: "Spatial",
    tagline: "Fling beads into a ring — they catch and keep orbiting.",
    hint: "Drag and fling a bead toward a ring. Gravity grows the rings and pulls harder.",
    accent: "#8aa4c8",
  },
  {
    id: "pulse-pads",
    name: "Pulse Pads",
    collection: "studio",
    modality: "Rhythm",
    tagline: "Tap pads — each hits a distinct bongo tone.",
    hint: "Tap any pad. Each has its own bongo pitch.",
    accent: "#8fbc8f",
  },
  {
    id: "stone-polish",
    name: "Stone Polish",
    collection: "studio",
    modality: "Texture",
    tagline: "Rub the badge — grit falls away and the shine sweeps across.",
    hint: "Pick a shape along the bottom, then rub until the shine sweeps across.",
    accent: "#a89a84",
    badge: "WebGL",
  },
  {
    id: "slider-loom",
    name: "Slider Loom",
    collection: "field",
    modality: "Mechanical",
    tagline: "Drag the shuttle — the warp bows, plucks, and springs home.",
    hint: "Grab anywhere and pull the shuttle through the cords. Let go and they ring back.",
    accent: "#8fa894",
  },
  {
    id: "pen-clicker",
    name: "Pen Clicker",
    collection: "studio",
    modality: "Click",
    tagline: "Retractable click — tip out, tip in, again.",
    hint: "Press and hold the clicker, then release.",
    accent: "#6a8fad",
  },
  {
    id: "light-switch",
    name: "Light Switch",
    collection: "studio",
    modality: "Toggle",
    tagline: "Flip the paddle — room light answers the clack.",
    hint: "Tap or drag the switch up and down.",
    accent: "#e8d9a8",
  },
  {
    id: "lamp-toggle",
    name: "Lamp Toggle",
    collection: "field",
    modality: "Toggle",
    tagline: "Pull the yellow ball — Verlet cord snaps the light.",
    hint: "Pull the cord straight down until it snaps. Tap the ball to toggle.",
    accent: "#f7bd32",
  },
  {
    id: "keyboard-thock",
    name: "Keyboard Thock",
    collection: "field",
    modality: "Click",
    tagline: "Chunky bottom-out — soft plastic thock under the finger.",
    hint: "Tap a key, or drag across the board. Release lifts the key.",
    accent: "#7a8a98",
  },
  {
    id: "mouse-click",
    name: "Mouse Click",
    collection: "field",
    modality: "Click",
    tagline: "Left, right, wheel — desktop click comfort.",
    hint: "Tap left or right button, or the scroll wheel.",
    accent: "#6a7580",
  },
  {
    id: "big-button",
    name: "Big Button",
    collection: "field",
    modality: "Press",
    tagline: "One giant round press — deep thunk, soft rebound.",
    hint: "Press the big red button.",
    accent: "#c45a4a",
  },
  {
    id: "bubble-wrap",
    name: "Bubble Wrap",
    collection: "studio",
    modality: "Pop",
    tagline: "Pop every blister — soft membrane snap.",
    hint: "Tap or drag to pop. Sheet refills when empty.",
    accent: "#6a9aaa",
  },
  {
    id: "fidget-cube",
    name: "Fidget Cube",
    collection: "studio",
    modality: "Fidget",
    tagline: "Turn the cube. Each face is its own fidget.",
    hint: "Drag to turn it. Play the face that lands toward you.",
    accent: "#c45a4a",
  },
  {
    id: "fidget-spinner",
    name: "Fidget Spinner",
    collection: "studio",
    modality: "Fidget",
    tagline: "Flick the arms — bearings hum, then coast to still.",
    hint: "Drag to spin. Flick hard for a long coast.",
    accent: "#7a9aba",
  },
  {
    id: "zipper",
    name: "Zipper",
    collection: "field",
    modality: "Slide",
    tagline: "Pull the slider — teeth chatter open and shut.",
    hint: "Drag the zipper up and down.",
    accent: "#c4b080",
  },
] as const satisfies ExperienceMetaCore[];

/** Pure metadata — safe for server components / SSR. */
export const CATALOG: ExperienceMeta[] = CATALOG_BASE.map((entry) => applyProfile(entry));

export function getMeta(id: string): ExperienceMeta | undefined {
  return CATALOG.find((e) => e.id === id);
}

export function isExperienceId(id: string): id is ExperienceId {
  return CATALOG.some((e) => e.id === id);
}

export const MODALITIES = Array.from(new Set(CATALOG.map((e) => e.modality)));

/** Fixed tray clusters. Order is a place to learn, not a ranking. */
export type TrayGroup = {
  id: string;
  name: string;
  ids: ExperienceId[];
};

/** Flagships first in each cluster. One-note desk toys sit at the end. */
export const TRAY_GROUPS: TrayGroup[] = [
  {
    id: "fields",
    name: "Fields",
    ids: ["silk-fluid", "sand-tray", "ripple-pool", "mesh-lattice"],
  },
  {
    id: "motion",
    name: "In motion",
    ids: [
      "gear-mesh",
      "elastic-web",
      "magnetic-field",
      "slider-loom",
      "stone-polish",
      "orbit-beads",
    ],
  },
  {
    id: "desk",
    name: "On the desk",
    ids: [
      "keyboard-thock",
      "fidget-cube",
      "bubble-wrap",
      "zipper",
      "fidget-spinner",
      "pulse-pads",
      "lamp-toggle",
      "pen-clicker",
      "light-switch",
      "big-button",
      "mouse-click",
    ],
  },
];

export function experiencesInGroup(group: TrayGroup): ExperienceMeta[] {
  return group.ids.map((id) => getMeta(id)).filter((e): e is ExperienceMeta => !!e);
}

export function trayExperiences(): ExperienceMeta[] {
  return TRAY_GROUPS.flatMap(experiencesInGroup);
}
