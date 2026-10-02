import { Container, Graphics } from "pixi.js";
import { createHud } from "@/engine/hud";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Gear = {
  x: number;
  y: number;
  /** Pitch radius — meshing gears sit exactly this far apart, center to center. */
  r: number;
  teeth: number;
  /** Module. Addendum is one module; teeth nest into the mating valley. */
  m: number;
  angle: number;
  omega: number;
  parent: number;
};

type MeshLink = {
  a: number;
  b: number;
  prevTooth: number;
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
  glow: boolean;
};

type NutState = "fall" | "jam" | "crush";

type Nut = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  state: NutState;
  link: number;
  crush: number;
  wobble: number;
  /** 0 sitting in an open bay, 1 ground through. */
  bite: number;
  /** How much mesh travel it takes to finish a wedge. */
  tough: number;
  /** Seat in the mesh frame: depth along the entry, offset along the line of centers. */
  s: number;
  lat: number;
  /** Squeeze axis (line of centers). */
  sx: number;
  sy: number;
  grind: number;
};

type Crumb = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  spin: number;
  color: number;
  shell: boolean;
};

const BG = 0x161410;
const BRASS = [0xcbb892, 0xd4c09a, 0xb9a47c, 0xcebf96, 0xc2ae84];
const SPARK_COLORS = [0xfff6e0, 0xffc24a, 0xff7424, 0xffe2a2];

/** Tree of gears. `bearing` is the direction from the parent, in radians. */
const TREE = [
  { teeth: 16, parent: -1, bearing: 0 },
  { teeth: 12, parent: 0, bearing: 0.35 },
  { teeth: 10, parent: 0, bearing: 2.15 },
  { teeth: 8, parent: 0, bearing: -1.15 },
  { teeth: 8, parent: 1, bearing: 1.05 },
];

function profileRadius(gear: Gear, worldAng: number) {
  const pitch = (Math.PI * 2) / gear.teeth;
  const tipHalf = pitch * 0.2;
  const rootHalf = pitch * 0.28;
  const outer = gear.r + gear.m * 1.02;
  const root = gear.r - gear.m * 1.02;
  let p = worldAng - gear.angle;
  p -= pitch * Math.floor(p / pitch);
  if (p > pitch * 0.5) p -= pitch;
  const ap = Math.abs(p);
  if (ap <= tipHalf) return outer;
  if (ap >= rootHalf) return root;
  const t = (ap - tipHalf) / (rootHalf - tipHalf);
  const s = t * t * (3 - 2 * t);
  return outer + (root - outer) * s;
}

/** Clearance of a point to tooth metal. Negative means it sits inside a tooth. */
function toothClearance(gear: Gear, x: number, y: number) {
  const dx = x - gear.x;
  const dy = y - gear.y;
  const d = Math.hypot(dx, dy) || 0.001;
  const ang = Math.atan2(dy, dx);
  const radial = d - profileRadius(gear, ang);
  if (radial < 0) return radial;
  const pitch = (Math.PI * 2) / gear.teeth;
  let best = radial;
  for (let i = -8; i <= 8; i++) {
    const a = ang + (i / 8) * pitch;
    const pr = profileRadius(gear, a);
    const dist = Math.hypot(x - (gear.x + Math.cos(a) * pr), y - (gear.y + Math.sin(a) * pr));
    if (dist < best) best = dist;
  }
  return best;
}

type MeshFrame = {
  ux: number;
  uy: number;
  tx: number;
  ty: number;
  px: number;
  py: number;
};

/** Upward cusp of a mesh. `tx,ty` points out of the bite, toward the open side. */
function meshFrame(a: Gear, b: Gear): MeshFrame {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  let tx = -uy;
  let ty = ux;
  if (ty > 0) {
    tx = -tx;
    ty = -ty;
  }
  return { ux, uy, tx, ty, px: a.x + ux * a.r, py: a.y + uy * a.r };
}

type Seat = {
  x: number;
  y: number;
  s: number;
  lat: number;
  gap: number;
  frame: MeshFrame;
};

/**
 * A bay between meshing teeth that can hold this nut.
 * Without `near`, pick the deepest open bay. With `near`, stay in that same bay.
 */
function findSeat(
  a: Gear,
  b: Gear,
  nutR: number,
  near?: { s: number; lat: number },
): Seat | null {
  const frame = meshFrame(a, b);
  const m = a.m;
  const s1 = near ? Math.min(1.65, near.s + 0.16) : 1.65;
  const s0 = near ? Math.max(0.04, near.s - 0.22) : 0.08;
  const latC = near ? near.lat : 0;
  const latR = near ? 0.26 : 0.55;
  const fit = nutR * (near ? 0.92 : 0.8);
  let best: Seat | null = null;
  let bestScore = -Infinity;
  for (let s = s1; s >= s0; s -= 0.07) {
    for (let lat = latC - latR; lat <= latC + latR; lat += 0.07) {
      if (Math.abs(lat) > 0.62) continue;
      const x = frame.px + frame.tx * s * m + frame.ux * lat * m;
      const y = frame.py + frame.ty * s * m + frame.uy * lat * m;
      const gap = Math.min(toothClearance(a, x, y), toothClearance(b, x, y));
      if (gap < fit) continue;
      const score = near
        ? -Math.abs(s - near.s) * 3 - Math.abs(lat - near.lat) * 2 + gap / m
        : -s * 8 - Math.abs(lat) * 0.35 + gap / m;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y, s, lat, gap, frame };
      }
    }
  }
  return best;
}

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  const gears: Gear[] = [];
  const links: MeshLink[] = [];
  const sparks: Spark[] = [];
  const nuts: Nut[] = [];
  const crumbs: Crumb[] = [];

  function setChildFromParent(parent: Gear, child: Gear) {
    const alpha = Math.atan2(child.y - parent.y, child.x - parent.x);
    const psiI = parent.angle - alpha;
    const psiJ = ((Math.PI * 2) / child.teeth) * (0.5 - (psiI * parent.teeth) / (Math.PI * 2));
    child.angle = psiJ + alpha + Math.PI;
    child.omega = parent.omega * (-parent.teeth / child.teeth);
  }

  function setParentFromChild(parent: Gear, child: Gear) {
    const alpha = Math.atan2(child.y - parent.y, child.x - parent.x);
    const psiJ = child.angle - alpha - Math.PI;
    const psiI = ((Math.PI * 2) / parent.teeth) * (0.5 - (psiJ * child.teeth) / (Math.PI * 2));
    parent.angle = psiI + alpha;
    parent.omega = child.omega * (-child.teeth / parent.teeth);
  }

  /** Keep every gear's tooth in its partner's valley, and match speeds to tooth counts. */
  function lockTrain(driven: number) {
    const climbed = new Set<number>();
    let i = driven;
    while (gears[i] && gears[i].parent >= 0 && !climbed.has(i)) {
      climbed.add(i);
      const p = gears[i].parent;
      setParentFromChild(gears[p], gears[i]);
      i = p;
    }
    const stack = [i];
    const seen = new Set<number>([i]);
    while (stack.length) {
      const p = stack.pop()!;
      for (let c = 0; c < gears.length; c++) {
        if (gears[c].parent !== p || seen.has(c)) continue;
        setChildFromParent(gears[p], gears[c]);
        seen.add(c);
        stack.push(c);
      }
    }
  }

  function toothIndex(a: Gear, b: Gear) {
    const alpha = Math.atan2(b.y - a.y, b.x - a.x);
    const pitch = (Math.PI * 2) / a.teeth;
    return Math.floor((a.angle - alpha) / pitch);
  }

  function contact(a: Gear, b: Gear) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: a.x + (dx / len) * a.r,
      y: a.y + (dy / len) * a.r,
      tx: -dy / len,
      ty: dx / len,
    };
  }

  function spawnSparks(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    power: number,
    count: number,
    glow: boolean,
  ) {
    for (let i = 0; i < count; i++) {
      if (sparks.length > 160) sparks.shift();
      const along = (Math.random() < 0.72 ? 1 : -1) * (0.35 + Math.random() * 1.15);
      const scatter = (Math.random() - 0.5) * 1.35;
      const speed = (80 + Math.random() * 260) * (0.4 + power);
      const life = glow && i === 0 ? 0.14 + power * 0.08 : 0.1 + Math.random() * 0.2;
      sparks.push({
        x,
        y,
        vx: (dirX * along + dirY * scatter) * speed,
        vy: (dirY * along - dirX * scatter) * speed,
        life,
        max: life,
        size: glow && i === 0 ? 4.5 + power * 3.5 : 1.1 + Math.random() * 1.8,
        color: SPARK_COLORS[(Math.random() * SPARK_COLORS.length) | 0] ?? 0xffc24a,
        glow: glow && i === 0,
      });
    }
  }

  /** Mouths a falling nut can actually reach — the cusp is open to the top of the screen. */
  function openMouths() {
    const mouths: { index: number; seat: Seat; y: number }[] = [];
    for (let index = 0; index < links.length; index++) {
      const link = links[index];
      const a = gears[link.a];
      const b = gears[link.b];
      if (!a || !b) continue;
      const nutR = a.m * 0.5;
      const seat = findSeat(a, b, nutR);
      if (!seat || seat.s > 1.45) continue;
      let blocked = false;
      for (let y = seat.y - 12; y > Math.max(0, seat.y - a.m * 8); y -= 12) {
        for (const gear of gears) {
          if (gear === a || gear === b) continue;
          if (Math.hypot(seat.x - gear.x, y - gear.y) < gear.r * 0.62) {
            blocked = true;
            break;
          }
        }
        if (blocked) break;
      }
      if (blocked) continue;
      mouths.push({ index, seat, y: seat.y });
    }
    mouths.sort((p, q) => p.y - q.y);
    return mouths;
  }

  function spawnNut() {
    const taken = new Set(nuts.map((nut) => nut.link));
    const open = openMouths().filter((mouth) => !taken.has(mouth.index));
    const pick = open[(Math.random() * open.length) | 0];
    if (!pick) return;
    const gear = gears[links[pick.index].a];
    if (!gear) return;
    const r = gear.m * (0.44 + Math.random() * 0.06);
    nuts.push({
      x: pick.seat.x + (Math.random() - 0.5) * gear.m * 0.45,
      y: -16 - Math.random() * 28,
      vx: (Math.random() - 0.5) * 16,
      vy: 36,
      r,
      state: "fall",
      link: pick.index,
      crush: 0,
      wobble: Math.random() * 4,
      bite: 0,
      tough: 0.65 + Math.random() * 1.15,
      s: pick.seat.s,
      lat: pick.seat.lat,
      sx: pick.seat.frame.ux,
      sy: pick.seat.frame.uy,
      grind: 0,
    });
  }

  function burstNut(nut: Nut) {
    spawnSparks(nut.x, nut.y, 0.2, -0.9, 0.85, 7, true);
    for (let i = 0; i < 9; i++) {
      const shell = i < 2;
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const speed = (shell ? 150 : 70) + Math.random() * 160;
      const life = 0.45 + Math.random() * 0.4;
      crumbs.push({
        x: nut.x + (Math.random() - 0.5) * nut.r,
        y: nut.y + (Math.random() - 0.5) * nut.r * 0.4,
        vx: Math.cos(ang) * speed * (shell && i === 0 ? -1 : 1) * (shell ? 0.85 : 0.55),
        vy: Math.sin(ang) * speed * 0.65,
        life,
        max: life,
        size: shell ? nut.r * 0.62 : 1.8 + Math.random() * 2.8,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 10,
        color: shell ? (i === 0 ? 0x8d5a32 : 0xa86b3c) : 0xefd6a4,
        shell,
      });
    }
    audio.gearClick(1, 0.68);
    haptics.tap(16);
  }

  function build() {
    const units: { x: number; y: number; teeth: number; parent: number }[] = [];
    for (const spec of TREE) {
      if (spec.parent < 0) {
        units.push({ x: 0, y: 0, teeth: spec.teeth, parent: -1 });
        continue;
      }
      const p = units[spec.parent];
      // Pitch circles overlap slightly so tooth flanks seat instead of hovering.
      const dist = p.teeth / 2 + spec.teeth / 2 - 0.2;
      units.push({
        x: p.x + Math.cos(spec.bearing) * dist,
        y: p.y + Math.sin(spec.bearing) * dist,
        teeth: spec.teeth,
        parent: spec.parent,
      });
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const u of units) {
      const outer = u.teeth / 2 + 1.15;
      minX = Math.min(minX, u.x - outer);
      maxX = Math.max(maxX, u.x + outer);
      minY = Math.min(minY, u.y - outer);
      maxY = Math.max(maxY, u.y + outer);
    }
    const m = Math.min((w * 0.86) / (maxX - minX), (h * 0.74) / (maxY - minY));
    const ox = w * 0.5 - ((minX + maxX) / 2) * m;
    const oy = h * 0.46 - ((minY + maxY) / 2) * m;

    gears.length = 0;
    links.length = 0;
    sparks.length = 0;
    nuts.length = 0;
    crumbs.length = 0;
    for (const u of units) {
      gears.push({
        x: ox + u.x * m,
        y: oy + u.y * m,
        teeth: u.teeth,
        r: (u.teeth / 2) * m,
        m,
        angle: 0,
        omega: 0,
        parent: u.parent,
      });
    }
    for (let i = 0; i < gears.length; i++) {
      if (gears[i].parent >= 0) links.push({ a: gears[i].parent, b: i, prevTooth: 0 });
    }
    if (gears[0]) {
      gears[0].angle = 0.35;
      lockTrain(0);
    }
    for (const link of links) link.prevTooth = toothIndex(gears[link.a], gears[link.b]);
  }
  build();

  let coast = 0.988;
  let nutsOn = true;
  let spawnIn = 0.35;
  const hud = createHud(ctx.host);
  hud.slider("Coast", 0.94, 0.998, coast, (v) => {
    coast = v;
  });
  hud.toggle("Nuts", "Nuts", true, (on) => {
    nutsOn = on;
    nuts.length = 0;
    crumbs.length = 0;
    spawnIn = on ? 0.2 : 0;
    void audio.resume();
  });

  let drag: number | null = null;
  let lastAngle = 0;
  let px = 0;
  let py = 0;
  let drive = 0;

  audio.gearClick(0);

  const el = ctx.app.canvas;

  const crankPos = (gear: Gear) => ({
    x: gear.x + Math.cos(gear.angle) * gear.r * 0.48,
    y: gear.y + Math.sin(gear.angle) * gear.r * 0.48,
  });

  const toLocal = (clientX: number, clientY: number) => {
    const rect = el.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / Math.max(rect.width, 1)) * w,
      y: ((clientY - rect.top) / Math.max(rect.height, 1)) * h,
    };
  };

  const hit = (x: number, y: number) => {
    for (let i = 0; i < gears.length; i++) {
      const c = crankPos(gears[i]);
      if (Math.hypot(c.x - x, c.y - y) < 22) return i;
    }
    for (let i = 0; i < gears.length; i++) {
      if (Math.hypot(gears[i].x - x, gears[i].y - y) < gears[i].r * 0.78) return i;
    }
    return null;
  };

  const onDown = (e: PointerEvent) => {
    const p = toLocal(e.clientX, e.clientY);
    px = p.x;
    py = p.y;
    drag = hit(px, py);
    void audio.resume();
    if (drag != null) {
      lastAngle = Math.atan2(py - gears[drag].y, px - gears[drag].x);
      drive = drag;
      haptics.tap(10);
    }
  };
  const onMove = (e: PointerEvent) => {
    const p = toLocal(e.clientX, e.clientY);
    px = p.x;
    py = p.y;
  };
  const onUp = () => {
    drag = null;
  };

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  return {
    update(dt: number) {
      const step = Math.min(dt, 0.05);
      if (drag != null && gears[drag]) {
        const gear = gears[drag];
        const ang = Math.atan2(py - gear.y, px - gear.x);
        let dAng = ang - lastAngle;
        if (dAng > Math.PI) dAng -= Math.PI * 2;
        if (dAng < -Math.PI) dAng += Math.PI * 2;
        const wedged = nuts.reduce((n, nut) => n + (nut.state === "jam" ? 1 : 0), 0);
        if (wedged) dAng /= 1 + wedged * 0.55;
        gear.angle += dAng;
        gear.omega = Math.max(-14, Math.min(14, dAng / Math.max(step, 0.001)));
        lastAngle = ang;
        drive = drag;
        lockTrain(drag);
      } else if (gears[drive]) {
        const gear = gears[drive];
        const wedged = nuts.some((nut) => nut.state === "jam");
        gear.omega *= Math.pow(wedged ? coast * 0.955 : coast, step * 60);
        if (Math.abs(gear.omega) < 0.02) gear.omega = 0;
        gear.angle += gear.omega * step;
        lockTrain(drive);
      }

      let stepped = false;
      let loud = 0;
      for (let li = 0; li < links.length; li++) {
        const link = links[li];
        const a = gears[link.a];
        const b = gears[link.b];
        const tooth = toothIndex(a, b);
        const speed = Math.max(Math.abs(a.omega), Math.abs(b.omega));
        const point = contact(a, b);
        const sign = Math.sign(a.omega) || 1;
        const power = Math.min(1, speed / 7);
        if (tooth !== link.prevTooth && speed > 0.35) {
          const jumped = Math.min(3, Math.abs(tooth - link.prevTooth));
          spawnSparks(point.x, point.y, point.tx * sign, point.ty * sign, power, 5 + jumped * 3, true);
          stepped = true;
          loud = Math.max(loud, power);
          if (nutsOn) {
            for (const nut of nuts) {
              if (nut.state === "jam" && nut.link === li) nut.bite = Math.min(1.25, nut.bite + 0.28 / nut.tough);
            }
          }
        } else if (speed > 1.1 && Math.random() < step * speed * 1.4) {
          spawnSparks(point.x, point.y, point.tx * sign, point.ty * sign, power * 0.55, 1, false);
        }
        link.prevTooth = tooth;
      }

      if (nutsOn) {
        if (nuts.length < 3) {
          spawnIn -= step;
          if (spawnIn <= 0) {
            spawnNut();
            spawnIn = 0.42 + Math.random() * 0.28;
          }
        }
        for (let i = nuts.length - 1; i >= 0; i--) {
          const nut = nuts[i];
          const link = links[nut.link];
          const a = link ? gears[link.a] : undefined;
          const b = link ? gears[link.b] : undefined;
          if (!a || !b) {
            nuts.splice(i, 1);
            continue;
          }
          const speed = Math.max(Math.abs(a.omega), Math.abs(b.omega));
          if (nut.state === "fall") {
            const frame = meshFrame(a, b);
            const seat =
              findSeat(a, b, nut.r, { s: nut.s, lat: nut.lat }) ?? findSeat(a, b, nut.r);
            const aim = seat ?? {
              x: frame.px + frame.tx * nut.s * a.m + frame.ux * nut.lat * a.m,
              y: frame.py + frame.ty * nut.s * a.m + frame.uy * nut.lat * a.m,
            };
            if (seat) {
              nut.s = seat.s;
              nut.lat = seat.lat;
              nut.sx = seat.frame.ux;
              nut.sy = seat.frame.uy;
            }
            nut.vy = Math.min(480, nut.vy + 1500 * step);
            nut.y += nut.vy * step;
            nut.x += nut.vx * step;
            const span = Math.max(36, aim.y - nut.y);
            const gain = nut.y > aim.y - a.m * 2.2 ? 0.38 : Math.min(0.24, 16 / span);
            nut.x += (aim.x - nut.x) * gain;
            const entering = nut.y > aim.y - a.m * 1.15;
            const aligned = Math.abs(nut.x - aim.x) < a.m * 0.85 && nut.y < aim.y + nut.r;
            if (!entering && !aligned) {
              for (let pass = 0; pass < 3; pass++) {
                for (const gear of gears) {
                  if (gear === a || gear === b) continue;
                  const dx = nut.x - gear.x;
                  const dy = nut.y - gear.y;
                  const d = Math.hypot(dx, dy) || 1;
                  const limit = profileRadius(gear, Math.atan2(dy, dx)) + nut.r * 0.9;
                  if (d >= limit) continue;
                  nut.x = gear.x + (dx / d) * limit;
                  nut.y = gear.y + (dy / d) * limit;
                  if (nut.vy > 0) nut.vy *= 0.45;
                }
              }
              nut.x += (aim.x - nut.x) * 0.55;
            }
            nut.wobble += step * 3;
            if (seat && nut.y >= seat.y - nut.r * 0.85 && Math.abs(nut.x - seat.x) < a.m * 0.95) {
              nut.state = "jam";
              nut.s = seat.s;
              nut.lat = seat.lat;
              nut.x = seat.x;
              nut.y = seat.y;
              nut.vx = 0;
              nut.vy = 0;
              nut.sx = seat.frame.ux;
              nut.sy = seat.frame.uy;
              nut.bite = seat.gap < nut.r * 1.02 ? 0.28 : 0.04;
              audio.gearClick(0.5, 1.05);
              haptics.tap(8);
            } else if (nut.y > h + 40) {
              nuts.splice(i, 1);
            }
          } else if (nut.state === "jam") {
            const seat = findSeat(a, b, nut.r, { s: nut.s, lat: nut.lat });
            if (seat) {
              const stick = Math.min(1, step * 14);
              nut.x += (seat.x - nut.x) * stick;
              nut.y += (seat.y - nut.y) * stick;
              nut.s = seat.s;
              nut.lat = seat.lat;
              nut.sx = seat.frame.ux;
              nut.sy = seat.frame.uy;
              if (speed > 0.3 && seat.gap < nut.r * 1.2) nut.bite += (step * speed * 0.62) / nut.tough;
              else nut.bite = Math.max(0.04, nut.bite - step * 0.45);
            } else if (speed > 0.25) {
              nut.bite += (step * (1.05 + speed * 0.5)) / nut.tough;
            }
            nut.wobble += step * (8 + speed * 6);
            nut.grind -= step;
            if (speed > 0.45 && nut.grind <= 0) {
              nut.grind = 0.07 + Math.random() * 0.05;
              const tangentX = -nut.sy;
              const tangentY = nut.sx;
              spawnSparks(nut.x, nut.y, tangentX, tangentY, 0.35 + nut.bite * 0.5, 2, false);
              audio.gearClick(0.34 + nut.bite * 0.45, 0.58 + (1 - nut.bite) * 0.18);
            }
            if (nut.bite >= 1) {
              nut.state = "crush";
              nut.crush = Math.min(0.35, nut.bite * 0.2);
            }
          } else {
            const seat = findSeat(a, b, nut.r * 0.55, { s: nut.s, lat: nut.lat });
            if (seat) {
              nut.x = seat.x;
              nut.y = seat.y;
              nut.sx = seat.frame.ux;
              nut.sy = seat.frame.uy;
            }
            nut.crush += step / 0.18;
            nut.wobble += step * 16;
            if (nut.crush >= 1) {
              burstNut(nut);
              nuts.splice(i, 1);
              spawnIn = Math.min(spawnIn, 0.28);
            }
          }
        }
      }

      for (let i = crumbs.length - 1; i >= 0; i--) {
        const bit = crumbs[i];
        bit.life -= step;
        if (bit.life <= 0) {
          crumbs.splice(i, 1);
          continue;
        }
        bit.vy += 640 * step;
        bit.x += bit.vx * step;
        bit.y += bit.vy * step;
        bit.vx *= Math.exp(-1.2 * step);
        bit.rot += bit.spin * step;
      }

      if (stepped) {
        audio.gearClick(0.55 + loud * 0.45, 0.88 + loud * 0.35);
        if (loud > 0.28) haptics.tap(7);
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life -= step;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        s.x += s.vx * step;
        s.y += s.vy * step;
        const dragF = Math.exp(-3.2 * step);
        s.vx *= dragF;
        s.vy *= dragF;
      }

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: BG, alpha: 1 });

      for (let i = 0; i < gears.length; i++) {
        drawGear(g, gears[i], BRASS[i % BRASS.length] ?? 0xcbb892);
        const crank = crankPos(gears[i]);
        const grabbed = drag === i;
        g.circle(crank.x, crank.y, grabbed ? 11 : 8);
        g.fill({ color: 0xe7d7b4, alpha: 1 });
        g.circle(crank.x, crank.y, 3.5);
        g.fill({ color: 0x2a241c, alpha: 1 });
      }

      for (const nut of nuts) drawNut(g, nut);
      for (const bit of crumbs) drawCrumb(g, bit);

      for (const s of sparks) {
        const fade = Math.max(0, s.life / s.max);
        if (s.glow) {
          g.circle(s.x, s.y, s.size * (0.7 + fade));
          g.fill({ color: 0xfff4d4, alpha: 0.32 * fade });
        }
        g.moveTo(s.x, s.y);
        g.lineTo(s.x - s.vx * 0.016, s.y - s.vy * 0.016);
        g.stroke({
          width: Math.max(1, s.size * (0.4 + fade * 0.6)),
          color: s.color,
          alpha: Math.min(1, 0.2 + fade),
        });
      }
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
      drag = null;
      build();
    },
    destroy() {
      hud.destroy();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      layer.destroy({ children: true });
    },
  };
}

function drawNut(g: Graphics, nut: Nut) {
  const squash = nut.state === "crush" ? nut.crush : nut.state === "jam" ? 0.06 + nut.bite * 0.5 : 0;
  const rx = nut.r * (1.08 + squash * 0.85);
  const ry = Math.max(1.4, nut.r * (0.86 - squash * 0.68));
  const shake = nut.state === "jam" ? Math.sin(nut.wobble) * nut.bite * nut.r * 0.22 : 0;
  const x = nut.x + -nut.sy * shake;
  const y = nut.y + nut.sx * shake;
  const axis = Math.atan2(nut.sy, nut.sx);
  const c = Math.cos(axis);
  const s = Math.sin(axis);
  const shell = squash > 0.55 ? 0x8d5830 : 0xc49258;
  const paint = (ox: number, oy: number, arx: number, ary: number) => {
    const steps = 14;
    g.moveTo(x + (ox + arx) * c - oy * s, y + (ox + arx) * s + oy * c);
    for (let i = 1; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = ox + Math.cos(a) * arx;
      const py = oy + Math.sin(a) * ary;
      g.lineTo(x + px * c - py * s, y + px * s + py * c);
    }
    g.closePath();
  };
  paint(0, 0, rx, ry);
  g.fill({ color: shell, alpha: 1 });
  paint(-rx * 0.18, -ry * 0.22, rx * 0.24, Math.max(1, ry * 0.18));
  g.fill({ color: 0xe8c78e, alpha: 0.5 });
  const seam = (lx: number, ly: number) => ({ x: x + lx * c - ly * s, y: y + lx * s + ly * c });
  const a0 = seam(-rx * 0.72, 0);
  const a1 = seam(-rx * 0.08, ry * 0.1);
  const a2 = seam(rx * 0.74, 0);
  g.moveTo(a0.x, a0.y);
  g.lineTo(a1.x, a1.y);
  g.lineTo(a2.x, a2.y);
  g.stroke({ width: 1.6, color: 0x5a3820, alpha: 0.9 });
  if (squash > 0.22) {
    const crack = Math.min(1, (squash - 0.22) / 0.55);
    const c0 = seam(-rx * 0.04, -ry);
    const c1 = seam(rx * 0.14, -ry * 0.05);
    const c2 = seam(-rx * 0.18, ry * 0.35);
    const c3 = seam(rx * 0.02, ry);
    g.moveTo(c0.x, c0.y);
    g.lineTo(c1.x, c1.y);
    g.lineTo(c2.x, c2.y);
    g.lineTo(c3.x, c3.y);
    g.stroke({ width: 1.3 + crack, color: 0xfff3dc, alpha: 0.28 + crack * 0.7 });
  }
}

function drawCrumb(g: Graphics, bit: Crumb) {
  const fade = Math.max(0, bit.life / bit.max);
  const c = Math.cos(bit.rot);
  const s = Math.sin(bit.rot);
  const rx = bit.shell ? bit.size : bit.size * 0.75;
  const ry = bit.shell ? bit.size * 0.42 : bit.size * 0.55;
  const steps = bit.shell ? 8 : 6;
  g.moveTo(bit.x + c * rx, bit.y + s * rx);
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const px = Math.cos(a) * rx;
    const py = Math.sin(a) * ry;
    g.lineTo(bit.x + px * c - py * s, bit.y + px * s + py * c);
  }
  g.closePath();
  g.fill({ color: bit.color, alpha: fade });
}

function drawGear(g: Graphics, gear: Gear, color: number) {
  const pitch = (Math.PI * 2) / gear.teeth;
  const outer = gear.r + gear.m * 1.02;
  const root = gear.r - gear.m * 1.02;
  const tipHalf = pitch * 0.2;
  const rootHalf = pitch * 0.28;

  g.moveTo(gear.x + Math.cos(gear.angle - rootHalf) * root, gear.y + Math.sin(gear.angle - rootHalf) * root);
  for (let t = 0; t < gear.teeth; t++) {
    const a = gear.angle + t * pitch;
    g.lineTo(gear.x + Math.cos(a - rootHalf) * root, gear.y + Math.sin(a - rootHalf) * root);
    g.lineTo(gear.x + Math.cos(a - tipHalf) * outer, gear.y + Math.sin(a - tipHalf) * outer);
    g.lineTo(gear.x + Math.cos(a + tipHalf) * outer, gear.y + Math.sin(a + tipHalf) * outer);
    g.lineTo(gear.x + Math.cos(a + rootHalf) * root, gear.y + Math.sin(a + rootHalf) * root);
  }
  g.closePath();
  g.fill({ color, alpha: 1 });

  const web = root * 0.88;
  g.circle(gear.x, gear.y, web);
  g.fill({ color: 0x2c2822, alpha: 1 });
  g.circle(gear.x, gear.y, web);
  g.stroke({ width: Math.max(1.5, gear.m * 0.16), color: 0xe6d7b6, alpha: 0.88 });

  const holes = gear.teeth >= 14 ? 5 : gear.teeth >= 10 ? 4 : 3;
  const hub = Math.max(gear.m * 1.05, gear.r * 0.15);
  const holeOrbit = (web * 0.62 + hub) * 0.62;
  const holeR = Math.min(web * 0.16, Math.max(2.5, (holeOrbit - hub) * 0.42));
  for (let i = 0; i < holes; i++) {
    const a = gear.angle + (i / holes) * Math.PI * 2 + 0.2;
    g.circle(gear.x + Math.cos(a) * holeOrbit, gear.y + Math.sin(a) * holeOrbit, holeR);
    g.fill({ color: BG, alpha: 1 });
  }

  g.circle(gear.x, gear.y, gear.r * 0.2);
  g.fill({ color: 0xd2c4a4, alpha: 1 });
  g.circle(gear.x, gear.y, Math.max(3.5, gear.r * 0.07));
  g.fill({ color: 0x1c1814, alpha: 1 });
}

export const gearMesh: ExperienceModule = {
  id: "gear-mesh",
  collection: "field",
  name: "Gear Mesh",
  modality: "Mechanical",
  tagline: "Turn a crank — teeth mesh, nuts jam, and grind.",
  hint: "Grab a pale crank or the gear body. Nuts fall into the teeth — spin to grind them.",
  accent: "#c4b08a",
  mount,
};
