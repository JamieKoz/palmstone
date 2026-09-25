import type { ExperienceId, ExperienceMeta } from "./types";

/** Pure metadata — safe for server components / SSR. */
export const CATALOG: ExperienceMeta[] = [
  {
    id: "mesh-lattice",
    name: "Mesh Lattice",
    collection: "studio",
    modality: "WebGL",
    tagline: "Orbit the lattice. Search a song and watch it dance.",
    hint: "Drag to orbit. Scroll to zoom, or use the Zoom slider on a phone.",
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
    collection: "studio",
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
    hint: "Move across the water. Press for deeper drops.",
    accent: "#6a9fb5",
    badge: "WebGL",
  },
  {
    id: "elastic-web",
    name: "Elastic Web",
    collection: "studio",
    modality: "Elastic",
    tagline: "Pull nodes — spring-back and harmonic wobble.",
    hint: "Grab a node and pull. Release to watch it settle.",
    accent: "#c9a66b",
  },
  {
    id: "magnetic-field",
    name: "Magnetic Field",
    collection: "studio",
    modality: "Force",
    tagline: "Pull a swarm — your finger is a magnet, wells bend the field.",
    hint: "Drag wells, or touch empty space to attract. Double-tap to place another.",
    accent: "#7eb6c9",
  },
  {
    id: "gear-mesh",
    name: "Gear Mesh",
    collection: "field",
    modality: "Mechanical",
    tagline: "Turn a crank — teeth mesh, click, and coast.",
    hint: "Grab a pale crank or the gear body. Spin and let it coast.",
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
    collection: "field",
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
    hint: "Keep rubbing. The mirror builds slowly, then the whole badge flashes.",
    accent: "#a89a84",
    badge: "WebGL",
  },
  {
    id: "slider-loom",
    name: "Slider Loom",
    collection: "field",
    modality: "Mechanical",
    tagline: "Throw the shuttles — the warp leans and the weft seats with a snap.",
    hint: "Drag a shuttle or its track. It snaps into the weave.",
    accent: "#8fa894",
  },
  {
    id: "pen-clicker",
    name: "Pen Clicker",
    collection: "field",
    modality: "Click",
    tagline: "Retractable click — tip out, tip in, again.",
    hint: "Press and hold the clicker, then release.",
    accent: "#6a8fad",
  },
  {
    id: "light-switch",
    name: "Light Switch",
    collection: "field",
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
    collection: "field",
    modality: "Pop",
    tagline: "Pop every blister — soft membrane snap.",
    hint: "Tap or drag to pop. Sheet refills when empty.",
    accent: "#6a9aaa",
  },
  {
    id: "fidget-cube",
    name: "Fidget Cube",
    collection: "field",
    modality: "Fidget",
    tagline: "Play the face — arrows flip to click, switch, dial, stick, gear, soft.",
    hint: "Drag the face to play. Use the arrows to rotate.",
    accent: "#c45a4a",
  },
  {
    id: "fidget-spinner",
    name: "Fidget Spinner",
    collection: "field",
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
];

export function getMeta(id: string): ExperienceMeta | undefined {
  return CATALOG.find((e) => e.id === id);
}

export function isExperienceId(id: string): id is ExperienceId {
  return CATALOG.some((e) => e.id === id);
}

export const MODALITIES = Array.from(new Set(CATALOG.map((e) => e.modality)));

/** Condensed home-screen folders (iOS-style). */
export type PlayFolder = {
  id: string;
  name: string;
  blurb: string;
  accent: string;
  modalities: string[];
};

export const PLAY_FOLDERS: PlayFolder[] = [
  {
    id: "physics",
    name: "Physics",
    blurb: "Gears, weave, zipper",
    accent: "#c9a66b",
    modalities: ["Elastic", "Force", "Spatial", "Mechanical", "Slide"],
  },
  {
    id: "buttons",
    name: "Clickers and Buttons",
    blurb: "Clicks, switches, press",
    accent: "#7a8a98",
    modalities: ["Click", "Toggle", "Press"],
  },
  {
    id: "fidgets",
    name: "Fidgets",
    blurb: "Fidget, pop, rhythm",
    accent: "#c45a4a",
    modalities: ["Fidget", "Pop", "Rhythm", "Granular"],
  },
];

const STUDIO_ORDER: ExperienceId[] = [
  "mesh-lattice",
  "silk-fluid",
  "ripple-pool",
  "sand-tray",
  "elastic-web",
  "magnetic-field",
  "orbit-beads",
  "stone-polish",
];

export function studioExperiences(): ExperienceMeta[] {
  return STUDIO_ORDER.map((id) => getMeta(id)).filter((e): e is ExperienceMeta => !!e);
}

export function experiencesInFolder(folder: PlayFolder): ExperienceMeta[] {
  const set = new Set(folder.modalities);
  return CATALOG.filter((e) => e.collection === "field" && set.has(e.modality));
}
