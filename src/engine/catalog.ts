import type { ExperienceId, ExperienceMeta } from "./types";

/** Pure metadata — safe for server components / SSR. */
export const CATALOG: ExperienceMeta[] = [
  {
    id: "mesh-lattice",
    name: "Mesh Lattice",
    modality: "WebGL",
    tagline: "Orbit the lattice. Search a song and watch it dance.",
    hint: "Drag to orbit, scroll to zoom. Search or play Demo to drive the mesh.",
    accent: "#6db8b0",
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
    tagline: "Drag colorful dye through a living fluid field.",
    hint: "Drag to splash and swirl. Colors bloom as they flow.",
    accent: "#6db3a8",
    badge: "WebGL",
  },
  {
    id: "ripple-pool",
    name: "Ripple Pool",
    modality: "Fluid",
    tagline: "Drag the surface — real water refraction and wake.",
    hint: "Move across the water. Press for deeper drops.",
    accent: "#6a9fb5",
    badge: "WebGL",
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
    tagline: "Tap pads — each hits a distinct bongo tone.",
    hint: "Tap any pad. Each has its own bongo pitch.",
    accent: "#8fbc8f",
  },
  {
    id: "stone-polish",
    name: "Stone Polish",
    modality: "Texture",
    tagline: "Rub the surface smooth — sheen rises, friction falls.",
    hint: "Rub in strokes. Watch matte turn to mirror.",
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
  {
    id: "pen-clicker",
    name: "Pen Clicker",
    modality: "Click",
    tagline: "Retractable click — tip out, tip in, again.",
    hint: "Press and hold the clicker, then release.",
    accent: "#6a8fad",
  },
  {
    id: "light-switch",
    name: "Light Switch",
    modality: "Toggle",
    tagline: "Flip the paddle — room light answers the clack.",
    hint: "Tap or drag the switch up and down.",
    accent: "#e8d9a8",
  },
  {
    id: "lamp-toggle",
    name: "Lamp Toggle",
    modality: "Toggle",
    tagline: "Pull the yellow ball — Verlet cord snaps the light.",
    hint: "Pull the cord straight down until it snaps. Tap the ball to toggle.",
    accent: "#f7bd32",
  },
  {
    id: "keyboard-thock",
    name: "Keyboard Thock",
    modality: "Click",
    tagline: "Chunky bottom-out — soft plastic thock under the finger.",
    hint: "Tap the keys. Drag across for a cascade.",
    accent: "#7a8a98",
  },
  {
    id: "mouse-click",
    name: "Mouse Click",
    modality: "Click",
    tagline: "Left, right, wheel — desktop click comfort.",
    hint: "Tap left or right button, or the scroll wheel.",
    accent: "#6a7580",
  },
  {
    id: "big-button",
    name: "Big Button",
    modality: "Press",
    tagline: "One giant round press — deep thunk, soft rebound.",
    hint: "Press the big red button.",
    accent: "#c45a4a",
  },
  {
    id: "bubble-wrap",
    name: "Bubble Wrap",
    modality: "Pop",
    tagline: "Pop every blister — soft membrane snap.",
    hint: "Tap or drag to pop. Sheet refills when empty.",
    accent: "#6a9aaa",
  },
  {
    id: "fidget-cube",
    name: "Fidget Cube",
    modality: "Fidget",
    tagline: "Play the face — arrows flip to click, switch, dial, stick, gear, soft.",
    hint: "Drag the face to play. Use the arrows to rotate.",
    accent: "#c45a4a",
  },
  {
    id: "fidget-spinner",
    name: "Fidget Spinner",
    modality: "Fidget",
    tagline: "Flick the arms — bearings hum, then coast to still.",
    hint: "Drag to spin. Flick hard for a long coast.",
    accent: "#7a9aba",
  },
  {
    id: "zipper",
    name: "Zipper",
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
    id: "visual",
    name: "Visual",
    blurb: "Mesh, fluid, polish",
    accent: "#6db8b0",
    modalities: ["WebGL", "Fluid", "Texture"],
  },
  {
    id: "physics",
    name: "Physics",
    blurb: "Pull, orbit, gears",
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
    blurb: "Fidget, pop, rhythm, sand",
    accent: "#c45a4a",
    modalities: ["Fidget", "Pop", "Rhythm", "Granular"],
  },
];

export function experiencesInFolder(folder: PlayFolder): ExperienceMeta[] {
  const set = new Set(folder.modalities);
  return CATALOG.filter((e) => set.has(e.modality));
}
