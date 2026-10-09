import { Container, Graphics } from "pixi.js";
import { getSharedAudio } from "@/engine/audio";
import { createHud } from "@/engine/hud";
import { clearWorld, loadWorld, saveWorld, worldAgeSec } from "@/engine/worldState";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

/**
 * Infinite Garden — full-bleed zen pond.
 * Water and banks fill the page; soft sky is only a thin band at the top.
 * Drag bank to sow. Tap pond for a lily. Drag a plant to whittle. No panning.
 */

const ID = "infinite-garden";
const WORLD_VER = 22;
const MAX_PLANTS = 300;
const MAX_PADS = 10;
const MAX_REEDS = 520;
const MAX_BUGS = 20;
const MAX_PARTICLES = 100;
const MAX_RIPPLES = 28;
const MAX_DRIZZLE = 140;
const SHORE_SAMPLES = 72;

type Species = 0 | 1 | 2 | 3 | 4 | 5 | 6; // fern, bush, reed, broadleaf, bloom, clover, iris

type Plant = {
  x: number; // 0–1 bank position (around pond)
  z: number; // depth 0 back → 1 front (sort)
  bank: number; // angle around pond 0–1
  /** Radial distance in pond ellipse units (≥1 = on bank). Keeps seeds at click. */
  dist: number;
  species: Species;
  seed: number;
  age: number;
  lifespan: number;
  rate: number;
  maxH: number;
  lean: number;
  branchiness: number;
  leafiness: number;
  hue: number;
  flowerAt: number;
  reseedChance: number;
  health: number;
};

type LilyPad = {
  /** Depth along pond 0 (bulb top) → 1 (off bottom of screen). */
  ty: number;
  /** Lateral position within local half-width, −1…1. */
  lat: number;
  r: number;
  age: number;
  bloom: number;
  phase: number;
  /** Press bounce — decays over ~1s */
  bob: number;
};

/** Shore reeds — grow on their own, whittle like plants. */
type EdgeReed = {
  bank: number;
  dist: number;
  h: number; // 0–1 growth
  health: number;
  seed: number;
  blades: number;
  phase: number;
  maxH: number;
};

type Ripple = { x: number; y: number; life: number; maxR?: number };
type DrizzleDrop = {
  x: number;
  y: number;
  vy: number;
  len: number;
  a: number;
  /** If set, ignore water until the drop reaches this depth (lets lower-pond rain land). */
  hitY?: number;
};

type Bug = { x: number; y: number; vx: number; species: number; phase: number };
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  col: number;
  kind: number;
};

type GardenWorld = { v?: number; plants: Plant[]; pads: LilyPad[]; reeds: EdgeReed[]; day: number };

function makeReed(bank: number, dist?: number, h = 0.15): EdgeReed {
  const seed = hash(bank * 41 + (dist ?? 1) * 17);
  return {
    bank,
    dist: dist ?? 1.02 + seed * 0.08,
    h,
    health: 1,
    seed,
    blades: 4 + Math.floor(seed * 5),
    phase: seed * 10,
    maxH: 0.55 + seed * 0.45,
  };
}

/** Dense shore thickets that thin out as they leave the waterline. */
function seedReedClumps(into: EdgeReed[], soft = false) {
  const shore = 0.98; // waterline
  const outer = 1.42; // farthest sparse fringe
  const clumps = 12 + Math.floor(hash(11.3) * 6); // 12–17
  for (let c = 0; c < clumps; c++) {
    const center = (c / clumps + hash(c * 2.7) * 0.05) % 1;
    const spread = 0.022 + hash(c * 4.1) * 0.05; // angular half-width
    const count = 16 + Math.floor(hash(c * 1.9) * 22); // 16–37 stalks
    for (let i = 0; i < count && into.length < MAX_REEDS; i++) {
      const jitter = (hash(c * 40 + i * 3.1) - 0.5) * 2;
      // Outer stalks fan a little wider than the dense core.
      const tRaw = hash(c * 50 + i); // 0–1
      // Bias toward shore: most mass near water, sparse fringe further out.
      const t = Math.pow(tRaw, 1.85);
      const dist = shore + t * (outer - shore);
      const bank = (center + jitter * spread * (0.7 + t * 0.55) + 1) % 1;
      // Shorter / thinner as they leave the pond.
      const hBase = soft ? 0.08 + hash(c + i) * 0.18 : 0.28 + hash(c * 7 + i) * 0.72;
      const h = hBase * (1 - t * 0.45);
      into.push(makeReed(bank, dist, h));
    }
  }
}

function hash(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function lifeT(p: Plant) {
  return Math.min(1, p.age / p.lifespan);
}

function growth(p: Plant) {
  const t = lifeT(p);
  const h = Math.max(0.12, p.health);
  if (t < 0.05) return (t / 0.05) * 0.1 * h;
  if (t < 0.48) return (0.1 + ((t - 0.05) / 0.43) * 0.9) * h;
  if (t < 0.66) return h;
  if (t < 0.84) return (1 - ((t - 0.66) / 0.18) * 0.4) * h;
  return Math.max(0, 0.6 * (1 - (t - 0.84) / 0.16) * h);
}

function flowerAmt(p: Plant) {
  const t = lifeT(p);
  if (p.health < 0.35 || t < p.flowerAt) return 0;
  if (t < p.flowerAt + 0.1) return (t - p.flowerAt) / 0.1;
  if (t < 0.72) return 1;
  if (t < 0.88) return 1 - (t - 0.72) / 0.16;
  return 0;
}

function witherAmt(p: Plant) {
  const t = lifeT(p);
  return Math.max(t < 0.66 ? 0 : Math.min(1, (t - 0.66) / 0.34), 1 - p.health);
}

/** Bias toward flowering plants when the user sows. */
function pickSowSpecies(at: number): Species {
  const roll = hash(at * 19.7 + 3.1);
  if (roll < 0.38) return 4; // bloom
  if (roll < 0.52) return 5; // clover
  if (roll < 0.64) return 6; // iris
  if (roll < 0.76) return 1; // bush
  if (roll < 0.86) return 3; // broadleaf
  if (roll < 0.94) return 0; // fern
  return 2; // reed
}

function makePlant(bank: number, z: number, species?: Species, age = 0.05, dist?: number): Plant {
  const s = (species ?? pickSowSpecies(bank + z)) as Species;
  const seed = hash(bank * 17 + z * 31 + s * 3.1);
  const d = dist ?? 1.08 + z * 0.55;
  return {
    x: bank,
    z,
    bank,
    dist: d,
    species: s,
    seed,
    age,
    lifespan: 300 + seed * 75, // ~50% longer before natural wither
    rate: 0.9 + seed * 0.75,
    maxH:
      0.18 +
      seed * 0.2 +
      (s === 1
        ? 0.06
        : s === 2
          ? 0.12
          : s === 3
            ? 0.05
            : s === 4
              ? 0.08
              : s === 5
                ? 0.03
                : s === 6
                  ? 0.14
                  : 0.04),
    lean: (seed - 0.5) * 0.25,
    branchiness: 0.45 + hash(seed * 8) * 0.55,
    leafiness: 0.55 + hash(seed * 11) * 0.45,
    hue: hash(seed * 14),
    flowerAt:
      s === 4 || s === 5
        ? 0.18 + hash(seed * 18) * 0.1
        : s === 6
          ? 0.3 + hash(seed * 18) * 0.12
          : 0.28 + hash(seed * 18) * 0.14,
    reseedChance: 0.4 + hash(seed * 22) * 0.4,
    health: 1,
  };
}

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  const shared = getSharedAudio();
  let w = ctx.width;
  let h = ctx.height;

  const ensureGardenAudio = () => {
    void audio.resume().then(() => {
      shared.startGarden(0.4);
      // Soft rain bed under the zen theme (same loop as Rain Glass).
      void shared.startRain(0.22);
    });
  };
  ensureGardenAudio();

  const layer = new Container();
  root.addChild(layer);
  const bg = new Graphics();
  const mid = new Graphics();
  const water = new Graphics();
  const flora = new Graphics();
  const fx = new Graphics();
  layer.addChild(bg);
  layer.addChild(mid);
  layer.addChild(water);
  layer.addChild(flora);
  layer.addChild(fx);

  const saved = loadWorld<GardenWorld>(ID);
  const away = Math.min(3600, worldAgeSec(ID) ?? 0);
  let day = saved?.day ?? 0.28;
  let plants: Plant[] = [];
  let pads: LilyPad[] = [];
  let reeds: EdgeReed[] = [];

  if (saved?.v === WORLD_VER && saved.plants?.length) {
    plants = saved.plants.map((p) => ({
      ...p,
      bank: p.bank ?? p.x,
      dist: p.dist ?? 1.08 + (p.z ?? 0.4) * 0.55,
      age: p.age + away * (p.rate ?? 1) * 0.55,
      health: p.health ?? 1,
      z: p.z ?? hash(p.x * 9),
    }));
    pads = (saved.pads ?? []).map((p) => ({ ...p, age: p.age + away * 0.2, bob: p.bob ?? 0 }));
    reeds = (saved.reeds ?? []).map((r) => ({
      ...r,
      h: Math.min(1, r.h + away * 0.01),
      health: r.health ?? 1,
    }));
    day = ((saved.day ?? 0.28) + away / 520) % 1;
  } else {
    for (let i = 0; i < 58; i++) {
      // Heavy on blooms — garden should feel floriferous.
      const species = ([4, 5, 1, 6, 4, 3, 5, 4, 0, 6, 1, 4][i % 12]) as Species;
      const z = 0.08 + hash(i * 4.1) * 0.88;
      plants.push(makePlant(hash(i * 2.7), z, species, 8 + hash(i) * 28, 1.08 + z * 0.55));
    }
    // Pads seeded below once spacing helpers exist.
  }
  if (reeds.length === 0) seedReedClumps(reeds);

  const bugs: Bug[] = Array.from({ length: 5 }, (_, i) => ({
    x: 0.2 + Math.random() * 0.6,
    y: 0.55 + Math.random() * 0.25,
    vx: (Math.random() - 0.5) * 0.03,
    species: i % 3,
    phase: Math.random() * 10,
  }));
  const particles: Particle[] = [];

  let time = 0;
  let timeScale = 1.8;
  let dirty = false;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pointer = false;
  /** Locked for the whole stroke so sow drags don't start whittling fresh seeds. */
  let dragMode: "sow" | "whittle" | "pad" | "pond" | null = null;
  let px = 0;
  let py = 0;
  let strokeAcc = 0;
  let eventAcc = 0;
  let moteAcc = 0;
  let drizzleAcc = 0;
  const ripples: Ripple[] = [];
  const drizzle: DrizzleDrop[] = [];

  const persist = () => {
    saveWorld<GardenWorld>(ID, {
      v: WORLD_VER,
      plants: plants.map((p) => ({ ...p })),
      pads: pads.slice(0, MAX_PADS),
      reeds: reeds.slice(0, MAX_REEDS),
      day,
    });
    dirty = false;
  };
  const scheduleSave = () => {
    dirty = true;
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      persist();
    }, 1800);
  };

  /**
   * Cul-de-sac pond (restored pre-horizon shape): rounded bulb, open channel
   * that continues past the bottom. horizonY only clamps plant growth.
   */
  const layout = () => {
    const skyBand = h * 0.08;
    const horizonY = skyBand + h * 0.045;
    const soilY = h * 0.97;
    const pondTop = h * 0.2;
    const pondBot = h * 1.2;
    const pondH = pondBot - pondTop;
    const pondW = w * 0.27;
    const pondCx = w * 0.5;
    const pondCy = pondTop + pondH * 0.28;
    const growH = h * 0.26;
    return {
      soilY,
      skyBand,
      horizonY,
      pondTop,
      pondBot,
      pondH,
      pondW,
      pondCx,
      pondCy,
      pondRx: pondW,
      pondRy: pondH * 0.38,
      growH,
      x0: w * 0.02,
      x1: w * 0.98,
    };
  };

  /** Half-width at normalized depth ty (0 bulb top → 1 past bottom). */
  const pondHalfWidthNorm = (ty: number) => {
    const t = Math.max(0, Math.min(1, ty));
    // Rounded head
    if (t < 0.16) {
      const u = 1 - t / 0.16;
      return Math.sqrt(Math.max(0, 1 - u * u)) * 1.0;
    }
    // Bulb easing into channel
    if (t < 0.34) {
      const u = (t - 0.16) / 0.18;
      return 1.0 - u * 0.4; // 1.0 → 0.6
    }
    // Open river channel — continues past the bottom of the screen
    return 0.58 + Math.sin(t * 5.5) * 0.03;
  };

  const inPondShape = (sx: number, sy: number) => {
    const L = layout();
    if (sy < L.pondTop || sy > L.pondBot) return false;
    const ty = (sy - L.pondTop) / L.pondH;
    const hw = pondHalfWidthNorm(ty) * L.pondW;
    return Math.abs(sx - L.pondCx) <= hw;
  };

  let shoreCacheKey = "";
  let shoreRadii: number[] = [];

  const computeShoreRadius = (ang: number) => {
    const L = layout();
    const maxR = Math.hypot(L.pondW * 1.3, L.pondH * 1.05);
    let lo = 0;
    let hi = maxR;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) * 0.5;
      const x = L.pondCx + Math.cos(ang) * mid;
      const y = L.pondCy + Math.sin(ang) * mid;
      if (inPondShape(x, y)) lo = mid;
      else hi = mid;
    }
    return (lo + hi) * 0.5;
  };

  const getShoreRadii = () => {
    const key = `${w | 0}x${h | 0}:culdesac-restore`;
    if (shoreCacheKey === key && shoreRadii.length === SHORE_SAMPLES) return shoreRadii;
    shoreCacheKey = key;
    shoreRadii = Array.from({ length: SHORE_SAMPLES }, (_, i) =>
      computeShoreRadius((i / SHORE_SAMPLES) * Math.PI * 2),
    );
    return shoreRadii;
  };

  const shoreRadius = (ang: number) => {
    const radii = getShoreRadii();
    const u = ((ang / (Math.PI * 2)) % 1 + 1) % 1;
    const f = u * SHORE_SAMPLES;
    const i = Math.floor(f) % SHORE_SAMPLES;
    const j = (i + 1) % SHORE_SAMPLES;
    const t = f - Math.floor(f);
    return radii[i] * (1 - t) + radii[j] * t;
  };

  /** Shore-relative polar → screen (dist 1 = shoreline). */
  const fromPondPolar = (ang: number, dist: number) => {
    const L = layout();
    const r = shoreRadius(ang) * dist;
    return {
      sx: L.pondCx + Math.cos(ang) * r,
      sy: L.pondCy + Math.sin(ang) * r,
    };
  };

  /** Screen → shore-relative polar (inverse of fromPondPolar). */
  const toPondPolar = (sx: number, sy: number) => {
    const L = layout();
    const ang = Math.atan2(sy - L.pondCy, sx - L.pondCx);
    const r = Math.max(1e-4, shoreRadius(ang));
    return {
      ang,
      dist: Math.hypot(sx - L.pondCx, sy - L.pondCy) / r,
    };
  };

  /** Place plant exactly from bank angle + radial dist (matches click). */
  const plantPos = (p: Plant) => {
    const L = layout();
    const dist = p.dist ?? 1.08 + p.z * 0.55;
    const { sx, sy } = fromPondPolar(p.bank * Math.PI * 2, dist);
    // Keep bases below the horizon so foliage never grows into the sky.
    return { sx, sy: Math.max(L.horizonY + 36, sy) };
  };

  const padPos = (pad: LilyPad) => {
    const L = layout();
    const idle = Math.sin(time * 0.7 + pad.phase) * 1.2;
    // Press bobble: dip down first, then rebound up, then settle.
    const press = (pad.bob ?? 0) > 0 ? Math.sin(pad.bob * Math.PI * 3) * 10 * pad.bob : 0;
    const ty = Math.max(0.04, Math.min(0.95, pad.ty ?? 0.3));
    const lat = Math.max(-0.9, Math.min(0.9, pad.lat ?? 0));
    const hw = pondHalfWidthNorm(ty) * L.pondW * 0.78;
    const sx = L.pondCx + lat * hw;
    const sy = L.pondTop + ty * L.pondH;
    return {
      sx,
      sy: sy + idle + press,
      rw: pad.r * L.pondW * 1.35 * (0.7 + Math.min(1, pad.age / 15) * 0.5),
      rh: pad.r * L.pondW * 0.95 * (0.7 + Math.min(1, pad.age / 15) * 0.5),
    };
  };

  const padNear = (sx: number, sy: number) => {
    let best = -1;
    let bestD = 28;
    for (let i = 0; i < pads.length; i++) {
      const { sx: px_, sy: py_, rw, rh } = padPos(pads[i]);
      const reach = Math.max(rw, rh) * 1.15 + 8;
      const d = Math.hypot(px_ - sx, (py_ - sy) * 1.1);
      if (d < reach && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  /** True if a pad at ty/lat would overlap an existing pad too much. */
  const padOverlaps = (ty: number, lat: number, minGap = 10) => {
    const probe = { ty, lat, r: 0.055, age: 12, bloom: 0, phase: 0, bob: 0 };
    const { sx, sy, rw, rh } = padPos(probe);
    const reach0 = Math.max(rw, rh);
    for (const p of pads) {
      const { sx: px_, sy: py_, rw: prw, rh: prh } = padPos(p);
      const need = reach0 + Math.max(prw, prh) + minGap;
      if (Math.hypot(px_ - sx, (py_ - sy) * 1.15) < need) return true;
    }
    return false;
  };

  const tryAddPad = (ty: number, lat: number, extra?: Partial<LilyPad>): boolean => {
    if (pads.length >= MAX_PADS) return false;
    const t = Math.max(0.06, Math.min(0.55, ty));
    const l = Math.max(-0.78, Math.min(0.78, lat));
    if (padOverlaps(t, l)) return false;
    pads.push({
      ty: t,
      lat: l,
      r: 0.04 + Math.random() * 0.05,
      age: 0,
      bloom: Math.random() > 0.3 ? 0.2 : 0,
      phase: Math.random() * 10,
      bob: 0,
      ...extra,
    });
    return true;
  };

  // Cull overlapping pads from saves, then fill the bulb with spaced pads.
  {
    const kept: LilyPad[] = [];
    for (const p of pads) {
      const { sx, sy, rw, rh } = padPos(p);
      const reach = Math.max(rw, rh);
      let ok = true;
      for (const q of kept) {
        const o = padPos(q);
        const need = reach + Math.max(o.rw, o.rh) + 12;
        if (Math.hypot(o.sx - sx, (o.sy - sy) * 1.15) < need) {
          ok = false;
          break;
        }
      }
      if (ok) kept.push(p);
    }
    pads.length = 0;
    pads.push(...kept);
  }
  if (pads.length < 6) {
    for (let i = 0; i < 40 && pads.length < Math.min(MAX_PADS, 9); i++) {
      tryAddPad(0.1 + hash(i * 2.1) * 0.38, (hash(i * 3.7) - 0.5) * 1.4, {
        age: 6 + hash(i) * 16,
        bloom: hash(i + 4) > 0.4 ? 0.3 + hash(i) * 0.6 : 0,
        r: 0.04 + hash(i * 5) * 0.05,
      });
    }
  }

  const reedPos = (r: EdgeReed) => {
    const { sx, sy } = fromPondPolar(r.bank * Math.PI * 2, r.dist);
    return { sx, sy, hgt: r.h * r.maxH * layout().growH * 0.85 * r.health };
  };

  const reedNear = (sx: number, sy: number) => {
    let best = -1;
    let bestD = 22;
    for (let i = 0; i < reeds.length; i++) {
      const { sx: rx, sy: ry, hgt } = reedPos(reeds[i]);
      if (sy > ry + 6 || sy < ry - hgt - 8) continue;
      const d = Math.hypot(rx - sx, (ry - sy) * 0.5);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  /** True when point is in the pond, inset from the shore by `margin` (0–1 of local half-width). */
  const pondInterior = (sx: number, sy: number, margin = 0.2) => {
    const L = layout();
    if (sy < L.pondTop + 6 || sy > Math.min(h + 4, L.pondBot)) return false;
    const ty = (sy - L.pondTop) / L.pondH;
    const hw = pondHalfWidthNorm(ty) * L.pondW;
    if (hw < 10) return false;
    return Math.abs(sx - L.pondCx) <= hw * Math.max(0.15, 1 - margin);
  };

  /** Max ripple radius that still fits inside the water at this point. */
  const rippleMaxRadius = (sx: number, sy: number) => {
    const L = layout();
    const ty = (sy - L.pondTop) / L.pondH;
    const hw = pondHalfWidthNorm(ty) * L.pondW;
    const toSide = hw - Math.abs(sx - L.pondCx);
    const toTop = sy - L.pondTop;
    return Math.max(5, Math.min(toSide, toTop) * 0.85);
  };

  const samplePondInterior = (margin = 0.22) => {
    const L = layout();
    // Sample uniformly along visible water (crest → bottom of screen)
    const yMin = L.pondTop + 12;
    const yMax = Math.min(h - 8, L.pondBot - 4);
    if (yMax <= yMin) return null;
    for (let attempt = 0; attempt < 14; attempt++) {
      const y = yMin + Math.random() * (yMax - yMin);
      const ty = (y - L.pondTop) / L.pondH;
      const hw = pondHalfWidthNorm(ty) * L.pondW;
      if (hw < 12) continue;
      const lat = (Math.random() - 0.5) * 2 * (1 - margin);
      const x = L.pondCx + lat * hw;
      if (pondInterior(x, y, margin)) return { x, y };
    }
    return null;
  };

  const addRipple = (sx: number, sy: number, life = 1, fromDrizzle = false) => {
    // Drizzle only splashes inset; taps can hit nearer the shore with a tiny ring.
    if (fromDrizzle) {
      if (!pondInterior(sx, sy, 0.22)) return;
    } else if (!inPond(sx, sy)) {
      return;
    }
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push({ x: sx, y: sy, life, maxR: rippleMaxRadius(sx, sy) });
  };

  const inPond = (sx: number, sy: number) => inPondShape(sx, sy);

  /** Full grass meadow — not a thin ring around the pond. */
  const onMeadow = (sx: number, sy: number) => {
    const L = layout();
    // Stay below the horizon so new growth can't poke into the sky.
    if (sy < L.horizonY + 36 || sy > L.soilY + 4) return false;
    if (sx < 4 || sx > w - 4) return false;
    return !inPondShape(sx, sy);
  };

  const plantNear = (sx: number, sy: number, rPx = 28) => {
    let best = -1;
    let bestD = rPx;
    for (let i = 0; i < plants.length; i++) {
      const { sx: px_, sy: py_ } = plantPos(plants[i]);
      const g = growth(plants[i]);
      const tip = py_ - plants[i].maxH * layout().growH * g;
      if (sy > py_ + 10 || sy < tip - 12) continue;
      const d = Math.hypot(px_ - sx, (py_ - sy) * 0.6);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  const shade = (col: number, k: number) => {
    const r = Math.min(255, Math.floor(((col >> 16) & 0xff) * k));
    const g = Math.min(255, Math.floor(((col >> 8) & 0xff) * k));
    const b = Math.min(255, Math.floor((col & 0xff) * k));
    return (r << 16) | (g << 8) | b;
  };

  const leafColor = (p: Plant, wither: number) => {
    const live = [
      [72, 128, 82], // fern
      [88, 142, 78], // bush
      [64, 118, 76], // reed
      [100, 152, 88], // broadleaf
      [78, 124, 90], // bloom
      [70, 138, 72], // clover
      [58, 110, 88], // iris
    ][p.species] ?? [80, 130, 80];
    const r = live[0] * (1 - wither) + 128 * wither + p.hue * 14;
    const g = live[1] * (1 - wither) + 112 * wither - p.hue * 8;
    const b = live[2] * (1 - wither) + 58 * wither;
    return (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
  };

  const plantAt = (sx: number, sy: number, species?: Species, quiet = false) => {
    if (inPond(sx, sy)) {
      // Open water → lily at press point (skip if too close to another pad).
      const L = layout();
      const ty = Math.max(0.05, Math.min(0.55, (sy - L.pondTop) / L.pondH));
      const hw = Math.max(1e-3, pondHalfWidthNorm(ty) * L.pondW);
      const lat = Math.max(-0.78, Math.min(0.78, (sx - L.pondCx) / hw));
      if (tryAddPad(ty, lat, { r: 0.035, bob: 0.85, age: 0 })) {
        if (!quiet) {
          audio.water(0.15);
          haptics.tap(4);
        }
        scheduleSave();
      }
      return;
    }
    if (!onMeadow(sx, sy)) return;
    // Exact click polar — no outer clamp so far meadow taps land under the finger.
    const { ang, dist: raw } = toPondPolar(sx, sy);
    const dist = Math.max(1.001, raw);
    const bank = (ang / (Math.PI * 2) + 1) % 1;
    const z = Math.max(0, Math.min(1, (dist - 1.06) / 1.6));
    if (plantNear(sx, sy, 14) >= 0) return;
    if (plants.length >= MAX_PLANTS) {
      // Cull the most spent plant — never a freshly sown seed.
      let worst = -1;
      let worstScore = -1;
      for (let i = 0; i < plants.length; i++) {
        const p = plants[i];
        if (p.age < 2.5) continue;
        const score = lifeT(p) + (1 - p.health) * 0.5 + witherAmt(p);
        if (score > worstScore) {
          worstScore = score;
          worst = i;
        }
      }
      if (worst < 0) return; // all plants are brand new — wait for capacity
      plants.splice(worst, 1);
    }
    const kind = species ?? pickSowSpecies(bank + dist + time);
    plants.push(makePlant(bank, z, kind, 0.03, dist));
    if (!quiet) {
      audio.grain(0.22, 0.55);
      haptics.tap(6);
    }
    scheduleSave();
  };

  const whittleReed = (i: number) => {
    const r = reeds[i];
    if (!r) return;
    r.health = Math.max(0.04, r.health - 0.12);
    r.h = Math.max(0.08, r.h - 0.08);
    const { sx: rx, sy: ry, hgt } = reedPos(r);
    if (particles.length < MAX_PARTICLES) {
      particles.push({
        x: rx + (Math.random() - 0.5) * 8,
        y: ry - hgt * 0.6,
        vx: (Math.random() - 0.5) * 22,
        vy: 4 + Math.random() * 14,
        life: 1,
        col: 0x5a8a50,
        kind: 0,
      });
    }
    audio.grain(0.12, 0.9);
    haptics.tap(2);
    if (r.health < 0.08) {
      reeds.splice(i, 1);
      scheduleSave();
    }
  };

  const whittle = (sx: number, sy: number) => {
    const ri = reedNear(sx, sy);
    if (ri >= 0) {
      whittleReed(ri);
      return;
    }
    const i = plantNear(sx, sy, 32);
    if (i < 0) return;
    const p = plants[i];
    p.health = Math.max(0.04, p.health - 0.1);
    p.age = Math.min(p.lifespan * 0.93, p.age + p.lifespan * 0.03);
    const { sx: px_, sy: py_ } = plantPos(p);
    if (particles.length < MAX_PARTICLES) {
      particles.push({
        x: px_ + (Math.random() - 0.5) * 14,
        y: py_ - growth(p) * p.maxH * layout().growH * 0.5,
        vx: (Math.random() - 0.5) * 28,
        vy: 6 + Math.random() * 18,
        life: 1,
        col: leafColor(p, witherAmt(p)),
        kind: 0,
      });
    }
    audio.grain(0.14, 0.85);
    haptics.tap(3);
    if (p.health < 0.07) {
      plants.splice(i, 1);
      scheduleSave();
    }
  };

  const onDown = (e: PointerEvent) => {
    pointer = true;
    const rect = ctx.app.canvas.getBoundingClientRect();
    px = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * w;
    py = ((e.clientY - rect.top) / Math.max(rect.height, 1)) * h;
    strokeAcc = 0;
    dragMode = null;
    void audio.resume();
    ensureGardenAudio();

    const padHit = padNear(px, py);
    if (padHit >= 0) {
      dragMode = "pad";
      pads[padHit].bob = 1;
      addRipple(px, py);
      audio.water(0.08);
      haptics.tap(3);
      return;
    }
    if (reedNear(px, py) >= 0 || plantNear(px, py, 28) >= 0) {
      dragMode = "whittle";
      whittle(px, py);
      return;
    }
    if (inPond(px, py)) {
      dragMode = "pond";
      addRipple(px, py);
      plantAt(px, py); // may add a lily at the press point
      return;
    }
    dragMode = "sow";
    plantAt(px, py);
  };
  const onMove = (e: PointerEvent) => {
    if (!pointer || !dragMode) return;
    const rect = ctx.app.canvas.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * w;
    const ny = ((e.clientY - rect.top) / Math.max(rect.height, 1)) * h;
    strokeAcc += Math.hypot(nx - px, ny - py);
    px = nx;
    py = ny;
    if (dragMode === "pad" || dragMode === "pond") return;
    if (strokeAcc > 36) {
      strokeAcc = 0;
      if (dragMode === "whittle") {
        if (reedNear(px, py) >= 0 || plantNear(px, py, 28) >= 0) whittle(px, py);
        return;
      }
      // Sow stroke: only plant — never prune mid-drag.
      if (padNear(px, py) >= 0 || inPond(px, py)) return;
      plantAt(px, py);
    }
  };
  const onUp = () => {
    pointer = false;
    dragMode = null;
  };

  const hud = createHud(ctx.host);
  hud.slider("Pace", 0.4, 4, timeScale, (v) => {
    timeScale = v;
  });
  hud.button("Clear bed", () => {
    plants.length = 0;
    pads.length = 0;
    reeds.length = 0;
    for (let i = 0; i < 30 && pads.length < 7; i++) {
      tryAddPad(0.1 + hash(i * 2.1) * 0.38, (hash(i * 3.7) - 0.5) * 1.4, {
        age: 4 + hash(i) * 10,
      });
    }
    seedReedClumps(reeds, true);
    clearWorld(ID);
    audio.whoosh(0.2);
  });

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  /**
   * Organic leaf: tapered tip, uneven lobes, midrib, light edge.
   * Drawn as a filled silhouette so plants read as foliage, not sticks.
   */
  const leaf = (
    g: Graphics,
    bx: number,
    by: number,
    tipX: number,
    tipY: number,
    halfW: number,
    col: number,
    alpha: number,
    veined = true,
  ) => {
    const dx = tipX - bx;
    const dy = tipY - by;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * halfW;
    const ny = (dx / len) * halfW;
    const wobble = hash(bx * 0.07 + by * 0.11 + tipX * 0.03);
    // Control points along the blade for a wavy, living outline.
    const q1x = bx + dx * 0.28 + nx * (1.15 + wobble * 0.35);
    const q1y = by + dy * 0.28 + ny * (1.15 + wobble * 0.35);
    const q2x = bx + dx * 0.62 + nx * (0.85 - wobble * 0.2);
    const q2y = by + dy * 0.62 + ny * (0.85 - wobble * 0.2);
    const q3x = bx + dx * 0.62 - nx * (1.05 + (1 - wobble) * 0.3);
    const q3y = by + dy * 0.62 - ny * (1.05 + (1 - wobble) * 0.3);
    const q4x = bx + dx * 0.28 - nx * (0.75 + wobble * 0.2);
    const q4y = by + dy * 0.28 - ny * (0.75 + wobble * 0.2);

    g.moveTo(bx, by);
    g.quadraticCurveTo(q1x, q1y, tipX, tipY);
    g.quadraticCurveTo(q3x, q3y, bx, by);
    g.fill({ color: col, alpha });

    if (veined && halfW > 4 && alpha > 0.35) {
      g.moveTo(bx, by);
      g.lineTo(bx + dx * 0.82, by + dy * 0.82);
      g.stroke({ width: 0.75, color: shade(col, 0.7), alpha: alpha * 0.38 });
    }
  };

  /** Soft day-cycle sky colours (0–1 day). */
  const skyColors = (d: number) => {
    // dawn → day → golden → dusk → night hush → dawn
    const phases = [
      { t: 0.0, top: [0x3a, 0x3e, 0x58], bot: [0xc8, 0x8a, 0x6e], sun: [0xf0, 0xb0, 0x78], a: 0.22 },
      { t: 0.12, top: [0xb8, 0xc8, 0xd0], bot: [0xe8, 0xd0, 0xb0], sun: [0xf4, 0xd8, 0xa0], a: 0.18 },
      { t: 0.28, top: [0xb0, 0xc4, 0xb8], bot: [0xd8, 0xe4, 0xd0], sun: [0xf0, 0xec, 0xd0], a: 0.1 },
      { t: 0.5, top: [0xa8, 0xb8, 0xb0], bot: [0xc4, 0xd2, 0xc0], sun: [0xe8, 0xec, 0xd8], a: 0.08 },
      { t: 0.7, top: [0xb0, 0xa0, 0x98], bot: [0xe0, 0xb8, 0x88], sun: [0xf0, 0xb8, 0x70], a: 0.2 },
      { t: 0.85, top: [0x4a, 0x48, 0x62], bot: [0xa0, 0x78, 0x78], sun: [0xd0, 0x88, 0x68], a: 0.16 },
      { t: 1.0, top: [0x3a, 0x3e, 0x58], bot: [0xc8, 0x8a, 0x6e], sun: [0xf0, 0xb0, 0x78], a: 0.22 },
    ];
    let i = 0;
    while (i < phases.length - 1 && d > phases[i + 1].t) i++;
    const a = phases[i];
    const b = phases[Math.min(i + 1, phases.length - 1)];
    const span = Math.max(1e-4, b.t - a.t);
    const u = Math.max(0, Math.min(1, (d - a.t) / span));
    const mix = (x: number[], y: number[]) =>
      (Math.floor(x[0] + (y[0] - x[0]) * u) << 16) |
      (Math.floor(x[1] + (y[1] - x[1]) * u) << 8) |
      Math.floor(x[2] + (y[2] - x[2]) * u);
    return {
      top: mix(a.top, b.top),
      bot: mix(a.bot, b.bot),
      sun: mix(a.sun, b.sun),
      sunA: a.a + (b.a - a.a) * u,
    };
  };

  const drawScene = () => {
    bg.clear();
    mid.clear();
    water.clear();
    const L = layout();
    const sky = skyColors(day);

    // Soft sky with subtle sunrise / sunset wash
    bg.rect(0, 0, w, L.skyBand + h * 0.12);
    bg.fill({ color: sky.top, alpha: 1 });
    bg.rect(0, L.skyBand * 0.35, w, L.skyBand + h * 0.1);
    bg.fill({ color: sky.bot, alpha: 0.72 });

    // Sun / glow drifts across the day
    const sunX = w * (0.12 + day * 0.76);
    const sunY = L.skyBand * (0.35 + Math.sin(day * Math.PI) * 0.45);
    bg.ellipse(sunX, sunY, w * 0.16, h * 0.05);
    bg.fill({ color: sky.sun, alpha: sky.sunA * 0.55 });
    bg.ellipse(sunX, sunY, w * 0.07, h * 0.028);
    bg.fill({ color: sky.sun, alpha: sky.sunA });

    // Grassy horizon ridge (replaces bare flat sky edge)
    const ridgeY = L.horizonY;
    bg.moveTo(0, ridgeY + 18);
    for (let i = 0; i <= 28; i++) {
      const x = (i / 28) * w;
      const y = ridgeY - 4 - hash(i + 4) * 10 - Math.sin(i * 0.7 + time * 0.05) * 1.2;
      bg.lineTo(x, y);
    }
    bg.lineTo(w, ridgeY + 22);
    bg.lineTo(0, ridgeY + 22);
    bg.closePath();
    bg.fill({ color: 0x4a6a44, alpha: 0.85 });
    // Grass blades along the ridge (stay at/below the crest)
    for (let i = 0; i < 55; i++) {
      const x = hash(i * 1.7) * w;
      const base = ridgeY + 4 + hash(i + 2) * 8;
      const bh = Math.min(base - (ridgeY - 2), 6 + hash(i + 5) * 10);
      const sway = Math.sin(time * 1.1 + i) * 2;
      bg.moveTo(x, base);
      bg.lineTo(x + sway, base - bh);
      bg.stroke({
        width: 1.2,
        color: hash(i) > 0.5 ? 0x6a9a58 : 0x4e7a48,
        alpha: 0.55,
      });
    }

    // Full-bleed moss / meadow ground — zen garden floor
    mid.rect(0, ridgeY + 8, w, L.soilY - ridgeY);
    mid.fill({ color: 0x4a6a42, alpha: 1 });
    mid.rect(0, ridgeY + 8, w, (L.soilY - ridgeY) * 0.35);
    mid.fill({ color: 0x5a7e50, alpha: 0.45 });
    mid.rect(0, L.pondCy, w, h - L.pondCy + 4);
    mid.fill({ color: 0x3e5e38, alpha: 0.35 });

    // Soft moss patches across the whole bank (not just a ring)
    for (let i = 0; i < 120; i++) {
      const sx = hash(i * 1.3) * w;
      const sy = ridgeY + 28 + hash(i * 2.1) * (L.soilY - ridgeY - 36);
      // Skip deep water interior
      if (toPondPolar(sx, sy).dist < 0.9) continue;
      const rr = 14 + hash(i + 3) * 28;
      mid.ellipse(sx, sy, rr, rr * 0.48);
      mid.fill({
        color: hash(i + 2) > 0.55 ? 0x6a9a58 : hash(i) > 0.4 ? 0x4e8450 : 0x3e6a42,
        alpha: 0.28 + hash(i + 5) * 0.22,
      });
      if (i % 3 === 0) {
        const bh = 5 + hash(i + 7) * 9;
        mid.moveTo(sx, sy);
        mid.lineTo(sx + (hash(i) - 0.5) * 5, sy - bh);
        mid.stroke({ width: 1.15, color: 0x5a8a50, alpha: 0.35 });
      }
    }

    // Barely-there soil edge at bottom
    mid.rect(0, L.soilY, w, h - L.soilY + 2);
    mid.fill({ color: 0x3a3228, alpha: 0.85 });

    // Cul-de-sac pond — restored polar outline (the shape that worked)
    const tracePond = (scale: number, ox = 0, oy = 0) => {
      const n = SHORE_SAMPLES;
      for (let i = 0; i <= n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const { sx, sy } = fromPondPolar(ang, scale);
        if (i === 0) water.moveTo(sx + ox, sy + oy);
        else water.lineTo(sx + ox, sy + oy);
      }
      water.closePath();
    };
    tracePond(1.04, 0, 5);
    water.fill({ color: 0x243830, alpha: 0.28 });
    tracePond(1.0);
    water.fill({ color: 0x2a5856, alpha: 1 });
    tracePond(0.92, 3, 1);
    water.fill({ color: 0x36706c, alpha: 0.85 });
    // Dark channel trail — profile fill so it runs past the bottom edge
    {
      const steps = 40;
      const inset = L.pondW * 0.34;
      let started = false;
      for (let i = 0; i <= steps; i++) {
        const ty = 0.22 + (i / steps) * 0.78;
        const y = L.pondTop + ty * L.pondH;
        const hw = Math.max(2, pondHalfWidthNorm(ty) * L.pondW - inset);
        if (!started) {
          water.moveTo(L.pondCx + hw, y);
          started = true;
        } else water.lineTo(L.pondCx + hw, y);
      }
      for (let i = steps; i >= 0; i--) {
        const ty = 0.22 + (i / steps) * 0.78;
        const y = L.pondTop + ty * L.pondH;
        const hw = Math.max(2, pondHalfWidthNorm(ty) * L.pondW - inset);
        water.lineTo(L.pondCx - hw, y);
      }
      water.closePath();
      water.fill({ color: 0x1a4246, alpha: 0.55 });
    }
    // Soft sky mirror in the bulb
    water.ellipse(L.pondCx - L.pondW * 0.15, L.pondCy - L.pondH * 0.06, L.pondW * 0.45, L.pondH * 0.1);
    water.fill({ color: sky.bot, alpha: 0.26 });
    tracePond(0.985);
    water.stroke({ width: 2.2, color: 0x8ab8a8, alpha: 0.16 });
    // Calm shimmer along the channel
    for (let i = 0; i < 7; i++) {
      const ty = 0.2 + hash(i) * 0.55;
      const y = L.pondTop + ty * L.pondH;
      if (y > h - 4) continue;
      const hw = pondHalfWidthNorm(ty) * L.pondW * 0.55;
      water.ellipse(L.pondCx + (hash(i + 2) - 0.5) * hw, y, 10 + hash(i) * 12, 2.4);
      water.fill({ color: 0xc0ddd4, alpha: 0.04 + Math.sin(time * 1.1 + i) * 0.022 });
    }
    // Ripples expand from the press / drizzle — clamped inside the water
    for (const r of ripples) {
      if (r.life <= 0.04) continue;
      const t = 1 - r.life;
      const cap = r.maxR ?? rippleMaxRadius(r.x, r.y);
      const rw = Math.min(8 + t * 42, cap);
      const rh = rw * 0.55;
      // Fade harder as we near the shore cap so rings don't read as leaving the pond
      const edgeFade = Math.min(1, (cap - rw) / Math.max(4, cap * 0.35) + 0.35);
      water.ellipse(r.x, r.y, rw, rh);
      water.stroke({ width: 1.3, color: 0xd8f0e8, alpha: r.life * 0.42 * edgeFade });
      if (r.life > 0.35 && rw * 0.55 < cap) {
        water.ellipse(r.x, r.y, rw * 0.55, rh * 0.55);
        water.stroke({ width: 1, color: 0xc0e4dc, alpha: (r.life - 0.35) * 0.32 * edgeFade });
      }
    }

    // Rim stones along the shore
    for (let i = 0; i < 34; i++) {
      const ang = (i / 34) * Math.PI * 2 + 0.12;
      const { sx, sy } = fromPondPolar(ang, 1.02 + hash(i) * 0.04);
      mid.ellipse(sx, sy, 5 + hash(i) * 7, 2.8 + hash(i + 1) * 2.6);
      mid.fill({ color: hash(i) > 0.5 ? 0x6e685c : 0x524c40, alpha: 0.55 });
    }
  };

  const drawLilyPad = (pad: LilyPad) => {
    const { sx, sy, rw, rh } = padPos(pad);
    const open = Math.min(1, pad.age / 8);
    if (open < 0.08) return;
    // Soft shadow in water
    flora.ellipse(sx + 1, sy + 2, rw * open * 1.05, rh * open * 1.05);
    flora.fill({ color: 0x1a3030, alpha: 0.2 * open });
    // Pad body — slightly irregular via two ellipses
    flora.ellipse(sx, sy, rw * open, rh * open);
    flora.fill({ color: 0x2e6a3e, alpha: 0.82 });
    flora.ellipse(sx - rw * 0.12, sy - rh * 0.18, rw * 0.55 * open, rh * 0.42 * open);
    flora.fill({ color: 0x5a9a52, alpha: 0.4 });
    flora.ellipse(sx + rw * 0.2, sy + rh * 0.1, rw * 0.35 * open, rh * 0.28 * open);
    flora.fill({ color: 0x245a32, alpha: 0.25 });
    // Radial veins
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + pad.phase * 0.2;
      flora.moveTo(sx, sy);
      flora.lineTo(sx + Math.cos(a) * rw * 0.8 * open, sy + Math.sin(a) * rh * 0.8 * open);
      flora.stroke({ width: 0.7, color: 0x1e4a2a, alpha: 0.4 * open });
    }
    // Classic V-notch (cut into water colour)
    flora.moveTo(sx, sy);
    flora.lineTo(sx + rw * 0.95 * open, sy - rh * 0.2 * open);
    flora.lineTo(sx + rw * 0.5 * open, sy + rh * 0.15 * open);
    flora.closePath();
    flora.fill({ color: 0x3a6e6a, alpha: 0.95 });

    if (pad.bloom > 0.15) {
      const b = Math.min(1, pad.bloom) * open;
      const fc = 0xf4ebe0;
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + time * 0.04;
        leaf(
          flora,
          sx,
          sy - rh * 0.08,
          sx + Math.cos(a) * rw * 0.52 * b,
          sy - rh * 0.08 - 7 * b - Math.abs(Math.sin(a)) * rw * 0.34 * b,
          3.2 * b,
          k % 2 ? 0xfff8f0 : fc,
          0.6 * b,
          false,
        );
      }
      flora.circle(sx, sy - rh * 0.12 - 5 * b, 3.1 * b);
      flora.fill({ color: 0xf0c858, alpha: 0.75 * b });
    }
  };

  /** Soil mound + basal tuft so stems read as rooted, not floating. */
  const drawGroundBase = (
    sx: number,
    sy: number,
    sc: number,
    col: number,
    colDark: number,
    alpha: (v: number) => number,
    seed: number,
    spread = 1,
  ) => {
    const w = (6.5 + spread * 3.5) * sc;
    // Soft contact shadow on the grass
    flora.ellipse(sx, sy + 2.2 * sc, w * 1.15, 2.6 * sc);
    flora.fill({ color: 0x2a3a28, alpha: alpha(0.22) });
    // Raised soil / moss crown
    flora.ellipse(sx, sy + 1.2 * sc, w, 2.4 * sc);
    flora.fill({ color: 0x4a3a28, alpha: alpha(0.55) });
    flora.ellipse(sx - w * 0.12, sy + 0.6 * sc, w * 0.72, 1.6 * sc);
    flora.fill({ color: 0x5a6a40, alpha: alpha(0.4) });
    // Short basal blades / leaf stubs that tuck into the mound
    const tuft = 4 + Math.floor(seed * 3);
    for (let i = 0; i < tuft; i++) {
      const t = (i + 0.5) / tuft;
      const side = i % 2 === 0 ? -1 : 1;
      const ang = -1.35 + side * (0.35 + t * 0.55);
      const len = (5 + t * 7 + spread * 2) * sc;
      leaf(
        flora,
        sx + side * 1.2 * sc,
        sy + 0.5 * sc,
        sx + Math.cos(ang) * len * 1.05,
        sy + Math.sin(ang) * len * 0.55 - 1,
        (2.2 + (1 - t) * 1.8) * sc,
        i % 2 ? colDark : shade(col, 0.9),
        alpha(0.5),
        false,
      );
    }
    // Tiny crown nub where the stem emerges
    flora.ellipse(sx, sy - 0.5 * sc, 2.4 * sc * spread, 1.5 * sc);
    flora.fill({ color: shade(colDark, 0.85), alpha: alpha(0.55) });
  };

  const drawPlant = (p: Plant) => {
    const gAmt = growth(p);
    if (gAmt < 0.02 && lifeT(p) > 0.95) return;
    const L = layout();
    const { sx, sy } = plantPos(p);
    if (sy < L.horizonY + 20) return;
    const wither = witherAmt(p);
    const flower = flowerAmt(p);
    const sway = Math.sin(time * (0.85 + p.seed * 0.5) + p.seed * 8) * (1 + gAmt * 3);
    // Cap height so tips / flowers never cross the horizon line.
    const hgt = Math.min(p.maxH * L.growH * gAmt, Math.max(8, sy - L.horizonY - 6));
    const lean = p.lean * hgt * 0.18 + sway;
    const tipX = sx + lean;
    const tipY = Math.max(L.horizonY + 4, sy - hgt);
    const col = leafColor(p, wither);
    const colDark = shade(col, 0.78);
    const colLit = shade(col, 1.15);
    const depth = 0.55 + p.z * 0.45;
    const sc = 0.8 + p.z * 0.35;
    const a = (v: number) => v * depth * (1 - wither * 0.3);

    if (lifeT(p) < 0.12) {
      flora.ellipse(sx, sy + 2, 4.5 * sc, 2.2 * sc);
      flora.fill({ color: 0x5a4430, alpha: 0.75 * depth });
      flora.circle(sx, sy, 1.8 * sc);
      flora.fill({ color: 0xc4a574, alpha: 0.9 });
      if (gAmt < 0.14) {
        const sh = 8 + gAmt * 26;
        leaf(flora, sx, sy, sx - 6 * sc + sway * 0.2, sy - sh * 0.85, 3.2 * sc, col, a(0.7));
        leaf(flora, sx, sy, sx + 6 * sc + sway * 0.2, sy - sh, 3.2 * sc, colLit, a(0.65));
        return;
      }
    }

    // Rooted base under mature foliage
    if (gAmt > 0.12) {
      const spread =
        p.species === 1 ? 1.25 : p.species === 2 || p.species === 6 ? 1.1 : p.species === 3 || p.species === 5 ? 1.2 : 1;
      drawGroundBase(sx, sy, sc, col, colDark, a, p.seed, spread);
    }

    // Lift foliage slightly so it emerges from the crown, not the soil plane
    const crownY = sy - 2.5 * sc;

    if (p.species === 0) {
      // Fern — layered pinnae with midrib
      const fronds = Math.floor(5 + p.leafiness * 4);
      for (let i = 0; i < fronds; i++) {
        const t = (i + 0.5) / fronds;
        const unfold = Math.min(1, gAmt / (0.14 + t * 0.35));
        if (unfold < 0.08) continue;
        const side = i % 2 === 0 ? -1 : 1;
        const ang = -1.2 + side * (0.5 + t * 0.4) + sway * 0.015;
        const len = hgt * (0.8 + t * 0.3) * unfold;
        const ex = sx + Math.cos(ang) * len;
        const ey = crownY + Math.sin(ang) * len;
        flora.moveTo(sx, crownY);
        flora.quadraticCurveTo(sx + (ex - sx) * 0.4, crownY + (ey - crownY) * 0.35 - 4, ex, ey);
        flora.stroke({ width: 1.2 * sc, color: colDark, alpha: a(0.35) });
        const leaflets = 5 + Math.floor(p.branchiness * 4);
        for (let k = 1; k <= leaflets; k++) {
          const ft = k / (leaflets + 0.3);
          const fx = sx + (ex - sx) * ft;
          const fy = crownY + (ey - crownY) * ft;
          const lw = (5.2 - k * 0.28) * unfold * sc;
          const lside = k % 2 === 0 ? 1 : -1;
          leaf(
            flora,
            fx,
            fy,
            fx + Math.cos(ang + lside * 1.15) * lw * 2.4,
            fy + Math.sin(ang + lside * 1.15) * lw * 1.15,
            lw * 0.5,
            k % 3 === 0 ? colDark : col,
            a(0.55 * unfold),
          );
        }
      }
    } else if (p.species === 1) {
      // Dense bush — many overlapping veined leaves
      const n = Math.floor(12 + p.leafiness * 16 * gAmt);
      for (let i = 0; i < n; i++) {
        const t = hash(p.seed * 11 + i);
        const unfold = Math.min(1, gAmt / (0.1 + t * 0.4));
        if (unfold < 0.08) continue;
        const ang = -0.2 - t * Math.PI * 0.75 + (hash(t + 2) - 0.5) * 0.5;
        const rad = hgt * (0.4 + t * 0.75) * unfold;
        const bx = sx + lean * 0.15;
        const by = crownY;
        const tx = sx + Math.cos(ang) * rad * 0.95 + lean * 0.35;
        const ty = crownY - Math.max(6, -Math.sin(ang) * rad) - hgt * t * 0.12;
        leaf(
          flora,
          bx,
          by,
          tx + sway * (0.2 + t),
          ty,
          (5.5 + t * 8) * unfold * sc,
          t > 0.55 ? colLit : t > 0.3 ? col : colDark,
          a(0.42 + unfold * 0.35),
        );
      }
    } else if (p.species === 2) {
      // Reeds — tapered filled blades with midrib
      const blades = Math.floor(5 + p.leafiness * 5);
      for (let i = 0; i < blades; i++) {
        const t = (i + 0.5) / blades;
        const unfold = Math.min(1, gAmt / (0.12 + t * 0.25));
        if (unfold < 0.08) continue;
        const bh = hgt * (0.6 + t * 0.5) * unfold;
        const tip = Math.sin(time * 1.3 + i + p.seed * 4) * 3.5;
        const bx = sx + (t - 0.5) * 14 * sc;
        leaf(
          flora,
          bx,
          crownY,
          bx + tip + lean * 0.4,
          crownY - bh,
          (2.4 + (1 - t) * 2) * unfold * sc,
          t > 0.5 ? col : colDark,
          a(0.58),
        );
      }
    } else if (p.species === 3) {
      // Broad hosta-like leaves from crown
      const n = Math.floor(5 + p.leafiness * 5 * gAmt);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const unfold = Math.min(1, (gAmt - t * 0.22 + 0.2) / 0.35);
        if (unfold < 0.08) continue;
        const side = i % 2 === 0 ? -1 : 1;
        const ang = -0.95 + side * (0.45 + t * 0.55) + sway * 0.012;
        const len = hgt * (0.75 + t * 0.4) * unfold;
        leaf(
          flora,
          sx,
          crownY,
          sx + Math.cos(ang) * len * 1.2,
          crownY + Math.sin(ang) * len,
          (7 + gAmt * 6) * unfold * sc,
          i % 2 ? colLit : col,
          a(0.52 * unfold),
        );
      }
    } else if (p.species === 5) {
      // Clover — low trifoliate clusters
      const clumps = Math.floor(4 + p.leafiness * 5 * gAmt);
      for (let i = 0; i < clumps; i++) {
        const t = hash(p.seed * 9 + i);
        const unfold = Math.min(1, gAmt / (0.1 + t * 0.35));
        if (unfold < 0.08) continue;
        const cx = sx + (t - 0.5) * 16 * sc + lean * 0.1;
        const cy = crownY + 2 - t * hgt * 0.35;
        const lr = (4.2 + t * 3.5) * unfold * sc;
        for (let k = 0; k < 3; k++) {
          const ang = -Math.PI / 2 + (k / 3) * Math.PI * 2 + t;
          leaf(
            flora,
            cx,
            cy,
            cx + Math.cos(ang) * lr,
            cy + Math.sin(ang) * lr * 0.75,
            lr * 0.42,
            k === 1 ? colLit : col,
            a(0.55 * unfold),
            true,
          );
        }
      }
    } else if (p.species === 6) {
      // Iris — upright sword leaves in a fan
      const blades = Math.floor(5 + p.leafiness * 4);
      for (let i = 0; i < blades; i++) {
        const t = (i + 0.5) / blades;
        const unfold = Math.min(1, gAmt / (0.12 + t * 0.28));
        if (unfold < 0.08) continue;
        const side = t - 0.5;
        const bh = hgt * (0.7 + t * 0.35) * unfold;
        const bx = sx + side * 11 * sc;
        const tip = lean * 0.5 + Math.sin(time * 1.1 + i + p.seed) * 2;
        leaf(
          flora,
          bx,
          crownY,
          bx + tip + side * 4,
          Math.max(L.horizonY + 4, crownY - bh),
          (2.8 + (1 - Math.abs(side)) * 1.6) * unfold * sc,
          i % 2 ? col : colDark,
          a(0.58),
          false,
        );
      }
      if (gAmt > 0.4) {
        flora.moveTo(sx, crownY);
        flora.quadraticCurveTo(sx + lean * 0.2, crownY - hgt * 0.55, tipX, tipY);
        flora.stroke({ width: 1.8 * sc, color: colDark, alpha: a(0.45) });
      }
    } else {
      // Flowering herb — basal rosette + bloom
      const n = Math.floor(5 + p.leafiness * 4 * gAmt);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const unfold = Math.min(1, gAmt / (0.12 + t * 0.3));
        if (unfold < 0.08) continue;
        const side = i % 2 === 0 ? -1 : 1;
        const ang = -1.0 + side * (0.4 + t * 0.45);
        const len = hgt * 0.7 * unfold;
        leaf(
          flora,
          sx,
          crownY,
          sx + Math.cos(ang) * len * 1.25 + sway * 0.25,
          crownY + Math.sin(ang) * len,
          (5 + gAmt * 4) * unfold * sc,
          col,
          a(0.55 * unfold),
        );
      }
      if (gAmt > 0.35) {
        flora.moveTo(sx, crownY);
        flora.quadraticCurveTo(sx + lean * 0.25, crownY - hgt * 0.5, tipX, tipY);
        flora.stroke({ width: 1.5 * sc, color: colDark, alpha: a(0.4) });
      }
    }

    // Flowers
    if (
      flower > 0.05 &&
      (p.species === 4 || p.species === 1 || p.species === 3 || p.species === 0 || p.species === 5 || p.species === 6)
    ) {
      const open = flower;
      const bloomPalette = [0xf0c868, 0xe8a0b0, 0xe8d070, 0xd8b0e0, 0xf0b878];
      const fc =
        p.species === 1
          ? 0xe8a8b8
          : p.species === 4
            ? bloomPalette[Math.floor(p.seed * bloomPalette.length)]
            : p.species === 0
              ? 0xe8d8f0
              : p.species === 5
                ? 0xf4f0e8
                : p.species === 6
                  ? 0xb898d8
                  : 0xe8d8b0;

      if (p.species === 5) {
        // Clover pom-pom blossoms, low among the leaves
        const heads = 2 + Math.floor(p.seed * 3);
        for (let i = 0; i < heads; i++) {
          const t = hash(p.seed * 5 + i);
          const cx = sx + (t - 0.5) * 14 * sc;
          const cy = Math.max(L.horizonY + 10, crownY - hgt * (0.15 + t * 0.35) * open);
          const fr = (3.2 + t * 2.2) * open * sc;
          for (let k = 0; k < 6; k++) {
            const ang = (k / 6) * Math.PI * 2 + t;
            flora.circle(cx + Math.cos(ang) * fr * 0.45, cy + Math.sin(ang) * fr * 0.35, fr * 0.28);
            flora.fill({ color: k % 2 ? 0xfff8f0 : fc, alpha: a(0.55 + open * 0.3) });
          }
          flora.circle(cx, cy, fr * 0.22);
          flora.fill({ color: 0xf0e8c8, alpha: a(0.65) });
        }
      } else if (p.species === 6) {
        // Iris — drooping standards / falls at the tip
        const cy = Math.max(L.horizonY + 10, tipY + 4);
        const cx = tipX;
        const fr = (6 + p.seed * 4) * open * sc;
        for (let k = 0; k < 3; k++) {
          const ang = -Math.PI / 2 + (k - 1) * 0.7;
          leaf(
            flora,
            cx,
            cy,
            cx + Math.cos(ang) * fr,
            cy + Math.sin(ang) * fr * 0.85 + (k === 1 ? -2 : 4),
            fr * 0.32,
            k === 1 ? shade(fc, 1.1) : fc,
            a(0.55 + open * 0.35),
            false,
          );
        }
        flora.circle(cx, cy - 1, fr * 0.18);
        flora.fill({ color: 0xe8d070, alpha: a(0.7) });
      } else {
        const drawFlowerHead = (cx: number, cy: number, scale: number) => {
          const petals = p.species === 4 ? 8 : 5;
          const fr = (5.2 + p.seed * 7 + (p.species === 4 ? 3.5 : 0)) * open * sc * scale;
          const cyClamped = Math.max(L.horizonY + 6 + fr * 0.7, cy);
          for (let k = 0; k < petals; k++) {
            const ang = (k / petals) * Math.PI * 2 + p.seed;
            leaf(
              flora,
              cx,
              cyClamped,
              cx + Math.cos(ang) * fr,
              cyClamped + Math.sin(ang) * fr * 0.7,
              fr * 0.3,
              k % 2 ? shade(fc, 1.08) : fc,
              a(0.55 + open * 0.35),
              false,
            );
          }
          flora.circle(cx, cyClamped, fr * 0.32);
          flora.fill({ color: 0xf2e2a8, alpha: a(0.7 + open * 0.25) });
        };
        const bloomY = Math.max(
          L.horizonY + 8,
          p.species === 4 || p.species === 0 ? tipY : sy - hgt * 0.5,
        );
        const bloomX = p.species === 4 || p.species === 0 ? tipX : sx + lean * 0.25;
        drawFlowerHead(bloomX, bloomY, 1);
        if (p.species === 4 && open > 0.4) {
          drawFlowerHead(bloomX - 9 * sc + lean * 0.15, bloomY + 8 * sc, 0.78);
          if (p.seed > 0.45) drawFlowerHead(bloomX + 8 * sc, bloomY + 12 * sc, 0.64);
        }
      }
    }
  };

  const drawReed = (r: EdgeReed) => {
    if (r.h < 0.06 || r.health < 0.05) return;
    const L = layout();
    const { sx, sy, hgt: rawH } = reedPos(r);
    if (sy < L.horizonY + 18) return;
    const hgt = Math.min(rawH, Math.max(6, sy - L.horizonY - 4));
    const sway = Math.sin(time * (1.1 + r.seed) + r.phase) * (2 + r.h * 4);
    const col = 0x4a7a48;
    const colDark = 0x3a5e3a;
    const width = 6 + r.blades * 1.4;
    const alpha = (v: number) => v * (0.55 + r.h * 0.35) * r.health;
    if (r.h > 0.15) drawGroundBase(sx, sy, 0.85, col, colDark, alpha, r.seed, 0.9 + r.blades * 0.06);
    const crownY = sy - 2;
    for (let i = 0; i < r.blades; i++) {
      const t = (i + 0.5) / r.blades;
      const bh = hgt * (0.55 + hash(r.seed * 9 + i) * 0.55);
      const bx = sx + (t - 0.5) * width + (hash(r.seed + i) - 0.5) * 3;
      const tip = Math.sin(time * 1.4 + i + r.phase) * 3 + sway;
      leaf(
        flora,
        bx,
        crownY,
        bx + tip,
        Math.max(L.horizonY + 3, crownY - bh),
        (1.4 + (1 - t) * 2.2) * Math.max(0.35, r.h),
        i % 2 ? col : colDark,
        0.55 + r.h * 0.3,
        false,
      );
    }
  };

  return {
    update(dt: number) {
      time += dt;
      const sim = dt * timeScale;
      day = (day + sim * 0.006) % 1;
      for (let i = ripples.length - 1; i >= 0; i--) {
        ripples[i].life -= dt * 0.7;
        if (ripples[i].life <= 0) ripples.splice(i, 1);
      }
      const L = layout();

      for (let i = plants.length - 1; i >= 0; i--) {
        const p = plants[i];
        p.age += sim * p.rate;
        if (p.health < 1 && lifeT(p) < 0.5) p.health = Math.min(1, p.health + sim * 0.02);
        if (lifeT(p) >= 1 || p.health <= 0.04) {
          if (hash(p.seed + Math.floor(p.age)) < p.reseedChance && plants.length < MAX_PLANTS) {
            const nb = (p.bank + (hash(p.seed * 2) - 0.5) * 0.08 + 1) % 1;
            plants.push(makePlant(nb, p.z, p.species, 0.03, p.dist));
          }
          const { sx, sy } = plantPos(p);
          for (let k = 0; k < 3 && particles.length < MAX_PARTICLES; k++) {
            particles.push({
              x: sx + (Math.random() - 0.5) * 18,
              y: sy - 24,
              vx: (Math.random() - 0.5) * 30,
              vy: 8 + Math.random() * 22,
              life: 1,
              col: leafColor(p, 0.5),
              kind: 0,
            });
          }
          plants.splice(i, 1);
          scheduleSave();
        }
      }

      for (const pad of pads) {
        pad.age += sim * 0.45;
        pad.r = Math.min(0.11, pad.r + sim * 0.001);
        if (pad.bob > 0) pad.bob = Math.max(0, pad.bob - dt * 1.1);
        if (pad.bloom > 0 && pad.bloom < 1) pad.bloom = Math.min(1, pad.bloom + sim * 0.04);
        else if (pad.bloom === 0 && pad.age > 8 && Math.random() < sim * 0.04) pad.bloom = 0.05;
      }
      if (pads.length < MAX_PADS && Math.random() < sim * 0.15) {
        tryAddPad(0.1 + Math.random() * 0.4, (Math.random() - 0.5) * 1.4);
      }

      // Shore reeds grow passively; new shoots sprout inside existing clumps
      for (const r of reeds) {
        if (r.health < 1) r.health = Math.min(1, r.health + sim * 0.015);
        r.h = Math.min(1, r.h + sim * 0.012 * (0.6 + r.seed));
      }
      if (reeds.length < MAX_REEDS && Math.random() < sim * 0.5) {
        const parent = reeds[(Math.random() * reeds.length) | 0];
        if (parent) {
          // Prefer sprouting nearer the water than the parent’s fringe.
          const towardShore = Math.min(parent.dist, 0.98 + Math.pow(Math.random(), 1.7) * 0.4);
          reeds.push(
            makeReed(
              (parent.bank + (Math.random() - 0.5) * 0.035 + 1) % 1,
              Math.max(0.96, Math.min(1.42, towardShore + (Math.random() - 0.45) * 0.06)),
              0.05,
            ),
          );
        } else {
          seedReedClumps(reeds, true);
        }
        scheduleSave();
      }

      eventAcc += sim;
      if (eventAcc > 1.2) {
        eventAcc = 0;
        if (plants.length < MAX_PLANTS * 0.85 && Math.random() < 0.55) {
          const ang = Math.random();
          const z = Math.random();
          // Prefer blooms for ambient reseeding
          const kind = Math.random() < 0.65 ? (4 as Species) : pickSowSpecies(ang + z);
          plants.push(makePlant(ang, z, kind, 0.03, 1.08 + z * 0.55));
          scheduleSave();
        }
      }

      for (const bug of bugs) {
        bug.phase += sim;
        bug.x += bug.vx * sim;
        if (bug.species === 2) {
          bug.y = 0.4 + Math.sin(bug.phase * 2) * 0.12;
        } else {
          bug.y = 0.55 + Math.sin(bug.phase) * 0.04;
        }
        if (bug.x < 0.1 || bug.x > 0.9) bug.vx *= -1;
      }

      if (Math.random() < sim * 0.5 && particles.length < MAX_PARTICLES) {
        const mature = plants.filter((p) => lifeT(p) > 0.35 && lifeT(p) < 0.9);
        const p = mature[(Math.random() * mature.length) | 0];
        if (p) {
          const { sx, sy } = plantPos(p);
          particles.push({
            x: sx + (Math.random() - 0.5) * 12,
            y: sy - growth(p) * p.maxH * L.growH * (0.3 + Math.random() * 0.5),
            vx: (Math.random() - 0.5) * 18 + Math.sin(time * 0.4) * 6,
            vy: 5 + Math.random() * 14,
            life: 1,
            col: leafColor(p, witherAmt(p) * 0.4),
            kind: 0,
          });
        }
      }

      moteAcc += sim;
      if (moteAcc > 0.4) {
        moteAcc = 0;
        if (particles.length < MAX_PARTICLES && Math.random() < 0.4) {
          particles.push({
            x: Math.random() * w,
            y: h * (0.25 + Math.random() * 0.35),
            vx: (Math.random() - 0.5) * 8,
            vy: -2 - Math.random() * 6,
            life: 1,
            col: 0xe8e4c8,
            kind: 1,
          });
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const q = particles[i];
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        if (q.kind === 0) q.vy += 38 * dt;
        else q.vy += 5 * dt;
        q.life -= dt * (q.kind === 0 ? 0.4 : 0.25);
        if (q.life <= 0 || q.y > h) particles.splice(i, 1);
      }

      // Steady drizzle — water drops are aimed all along the pond depth
      drizzleAcc += sim;
      while (drizzleAcc > 0.014 && drizzle.length < MAX_DRIZZLE) {
        drizzleAcc -= 0.014;
        const overWater = Math.random() < 0.78;
        if (overWater) {
          const pt = samplePondInterior(0.24);
          if (!pt) continue;
          // Spawn just above the intended hit — if we spawn at the sky, drops
          // splash on the upper pond before they ever reach the channel.
          drizzle.push({
            x: pt.x - 5,
            y: pt.y - 18 - Math.random() * 36,
            vy: 190 + Math.random() * 120,
            len: 6 + Math.random() * 11,
            a: 0.16 + Math.random() * 0.22,
            hitY: pt.y,
          });
        } else {
          drizzle.push({
            x: Math.random() * w,
            y: -8 - Math.random() * 50,
            vy: 170 + Math.random() * 140,
            len: 6 + Math.random() * 11,
            a: 0.12 + Math.random() * 0.16,
          });
        }
      }
      for (let i = drizzle.length - 1; i >= 0; i--) {
        const d = drizzle[i];
        d.x += 22 * dt;
        d.y += d.vy * dt;
        if (d.y > h + 12) {
          drizzle.splice(i, 1);
          continue;
        }
        // Water-aimed drops wait until their depth; sky drops splash on first contact
        const reached = d.hitY == null || d.y >= d.hitY - 4;
        if (!reached) continue;
        if (pondInterior(d.x, d.y, 0.22) && Math.random() < 0.55) {
          addRipple(d.x, d.y, 0.5 + Math.random() * 0.3, true);
          drizzle.splice(i, 1);
        } else if (inPond(d.x, d.y) && !pondInterior(d.x, d.y, 0.12)) {
          // Near the edge: absorb quietly
          if (Math.random() < 0.35) drizzle.splice(i, 1);
        } else if (d.hitY != null && d.y > d.hitY + 28) {
          // Missed the inset target — drop continues / dies
          drizzle.splice(i, 1);
        }
      }

      try {
        drawScene();
        flora.clear();
        fx.clear();
        for (const pad of pads) drawLilyPad(pad);
        for (const r of reeds) drawReed(r);
        const sorted = plants.slice().sort((a, c) => a.z - c.z);
        for (const p of sorted) drawPlant(p);
      } catch (err) {
        if (!(globalThis as { __gardenDrawErr?: boolean }).__gardenDrawErr) {
          (globalThis as { __gardenDrawErr?: boolean }).__gardenDrawErr = true;
          console.error("[infinite-garden] draw failed", err);
        }
        bg.clear();
        bg.rect(0, 0, w, h);
        bg.fill({ color: 0x6a8a68, alpha: 1 });
      }

      for (const bug of bugs) {
        const bx = L.x0 + bug.x * (L.x1 - L.x0);
        const by = bug.y * h;
        if (bug.species === 2) {
          fx.circle(bx, by, 1.4);
          fx.fill({ color: 0x2a2a28, alpha: 0.65 });
        } else {
          fx.ellipse(bx, by, bug.species === 0 ? 2.2 : 2.8, 1.4);
          fx.fill({ color: bug.species === 0 ? 0x2e2820 : 0x8a6a40, alpha: 0.75 });
        }
      }

      for (const q of particles) {
        if (q.kind === 1) {
          fx.circle(q.x, q.y, 1.1);
          fx.fill({ color: q.col, alpha: 0.3 * q.life });
        } else {
          fx.ellipse(q.x, q.y, 3.2, 1.4);
          fx.fill({ color: q.col, alpha: 0.5 * q.life });
        }
      }

      // Drizzle streaks (drawn last so they sit lightly over the scene)
      for (const d of drizzle) {
        fx.moveTo(d.x, d.y);
        fx.lineTo(d.x - 1.2, d.y + d.len);
        fx.stroke({ width: 1.05, color: 0xd8e8f0, alpha: d.a });
      }
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
      shoreCacheKey = "";
      shoreRadii = [];
    },
    destroy() {
      if (saveTimer) clearTimeout(saveTimer);
      if (dirty || plants.length) persist();
      shared.stopGarden();
      shared.stopRain();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      hud.destroy();
      layer.destroy({ children: true });
    },
  };
}

export const infiniteGarden: ExperienceModule = {
  id: "infinite-garden",
  collection: "field",
  name: "Infinite Garden",
  modality: "Growth",
  tagline: "A full zen pond — water, moss, and slow growth filling the view.",
  hint: "Drag the banks to sow. Tap the water for a lily. Drag a plant to whittle.",
  accent: "#7f9e6a",
  badge: "World",
  mount,
};
