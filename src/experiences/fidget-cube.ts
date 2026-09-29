import { unlockAchievement } from "@/engine/achievements";
import { Container, Graphics, Text } from "pixi.js";
import { createHud } from "@/engine/hud";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

/**
 * A palm-sized cube. Drag anywhere that isn't a control to turn it —
 * it coasts and clicks into the next face. Each face is its own fidget.
 */

type V3 = [number, number, number];

type FaceId = 0 | 1 | 2 | 3 | 4 | 5;

type Mode =
  | { kind: "none" }
  | { kind: "tumble" }
  | { kind: "button"; index: number }
  | { kind: "switch" }
  | { kind: "dial"; last: number }
  | { kind: "stick" }
  | { kind: "gears"; last: number }
  | { kind: "stone" };

const TAU = Math.PI * 2;
const Q = Math.PI / 2;
const BEVEL = 0.18;
const CAM = 5.15;
const FOV = 4.55;
const SPAN = 0.6;

const LIGHT: V3 = normalize([-0.42, 0.78, 0.5]);

const FACE_NAME = ["Buttons", "Switch", "Dial", "Stick", "Gears", "Stone"];
const FACE_COLOR = [0xc45a4a, 0x5d8c9a, 0xc4a574, 0x6e9a74, 0x8a7d6c, 0x7d96b6];

const BASIS: { n: V3; u: V3; v: V3 }[] = [
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
];

const BUTTONS = [
  { u: 0, v: 0, r: 0.22 },
  { u: 0, v: 0.52, r: 0.155 },
  { u: 0.52, v: 0, r: 0.155 },
  { u: 0, v: -0.52, r: 0.155 },
  { u: -0.52, v: 0, r: 0.155 },
];

const GEAR_A = { u: -0.36, v: 0.02, r: 0.55, teeth: 10 };
const GEAR_B = { u: 0.4, v: -0.02, r: 0.44, teeth: 8 };

type MeshPoly = { face: FaceId | -1; pts: V3[]; n: V3 };

const MESH: MeshPoly[] = buildMesh();

function buildMesh(): MeshPoly[] {
  const i = 1 - BEVEL;
  const o = 1;
  const quads: V3[][] = [
    [
      [-i, -i, o],
      [i, -i, o],
      [i, i, o],
      [-i, i, o],
    ],
    [
      [o, -i, i],
      [o, -i, -i],
      [o, i, -i],
      [o, i, i],
    ],
    [
      [i, -i, -o],
      [-i, -i, -o],
      [-i, i, -o],
      [i, i, -o],
    ],
    [
      [-o, -i, -i],
      [-o, -i, i],
      [-o, i, i],
      [-o, i, -i],
    ],
    [
      [-i, o, -i],
      [i, o, -i],
      [i, o, i],
      [-i, o, i],
    ],
    [
      [-i, -o, i],
      [i, -o, i],
      [i, -o, -i],
      [-i, -o, -i],
    ],
  ];

  const polys: MeshPoly[] = quads.map((pts, face) => ({
    face: face as FaceId,
    pts,
    n: outward(pts),
  }));

  for (let a = 0; a < quads.length; a++) {
    for (let b = a + 1; b < quads.length; b++) {
      const pairs: [V3, V3][] = [];
      for (const p of quads[a]) {
        let best: V3 | null = null;
        let bestD = 0.48;
        for (const q of quads[b]) {
          const d = dist(p, q);
          if (d < bestD) {
            bestD = d;
            best = q;
          }
        }
        if (best) pairs.push([p, best]);
      }
      if (pairs.length === 2) {
        const pts: V3[] = [pairs[0][0], pairs[1][0], pairs[1][1], pairs[0][1]];
        polys.push({ face: -1, pts, n: outward(pts) });
      }
    }
  }

  const all = quads.flat();
  const used = new Set<number>();
  for (let s = 0; s < all.length; s++) {
    if (used.has(s)) continue;
    const group: V3[] = [all[s]];
    used.add(s);
    for (let j = s + 1; j < all.length; j++) {
      if (used.has(j)) continue;
      if (dist(all[s], all[j]) < 0.42) {
        group.push(all[j]);
        used.add(j);
      }
    }
    if (group.length === 3) {
      polys.push({ face: -1, pts: group, n: outward(group) });
    }
  }

  return polys;
}

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  const labelText = new Text({
    text: FACE_NAME[0],
    style: {
      fontFamily: "system-ui, sans-serif",
      fontSize: 13,
      fill: 0xe7e2d6,
      fontWeight: "600",
      letterSpacing: 1.4,
    },
  });
  labelText.anchor.set(0.5);
  layer.addChild(labelText);

  let cubeScale = 1;
  const hud = createHud(ctx.host);
  hud.slider("Size", 0.72, 1.35, cubeScale, (v) => {
    cubeScale = v;
  });

  let yaw = 0.72;
  let pitch = -0.48;
  let yawVel = 0;
  let pitchVel = 0;

  const press = [0, 0, 0, 0, 0];
  let switchOn = false;
  let switchT = 0;
  let dial = 0.4;
  let dialVel = 0;
  let dialStep = Math.round(dial / (TAU / 16));
  let stickX = 0;
  let stickY = 0;
  let stickTX = 0;
  let stickTY = 0;
  let gear = 0.2;
  let gearVel = 0;
  let gearStep = Math.round(gear / (TAU / GEAR_A.teeth));
  let stoneU = 0;
  let stoneV = 0.08;
  let stoneGlow = 0;
  let flash = 0;
  let clock = 0;

  let mode: Mode = { kind: "none" };
  let lastX = 0;
  let lastY = 0;
  let lastMoveAt = 0;
  let downX = 0;
  let downY = 0;

  const seen = new Set<number>();
  let plays = 0;
  let poseKey: string | null = null;
  let greeted = false;

  const play = () => {
    plays += 1;
    if (plays >= 40) unlockAchievement("cube-fidget");
  };

  const noteFace = (id: number) => {
    seen.add(id);
    if (seen.size >= 6) unlockAchievement("cube-tour");
  };

  const view = () => {
    const sc = Math.min(w, h) * 0.188 * cubeScale;
    const cx = w * 0.5;
    const cy = h * 0.46 + Math.sin(clock * 1.15) * 1.6;
    // Rest a little off-axis so neighboring faces stay visible.
    const show = Math.max(0, Math.cos(pitch));
    const yawV = yaw + 0.36 * show;
    const pitchV = pitch - 0.18 * show;
    const cyaw = Math.cos(yawV);
    const syaw = Math.sin(yawV);
    const cp = Math.cos(pitchV);
    const sp = Math.sin(pitchV);
    const rot = (p: V3): V3 => {
      const x1 = p[0] * cyaw + p[2] * syaw;
      const z1 = -p[0] * syaw + p[2] * cyaw;
      return [x1, p[1] * cp - z1 * sp, p[1] * sp + z1 * cp];
    };
    const project = (p: V3) => {
      const f = FOV / Math.max(0.4, CAM - p[2]);
      return { x: cx + p[0] * sc * f, y: cy - p[1] * sc * f, z: p[2] };
    };
    return { sc, cx, cy, rot, project };
  };

  const onFace = (id: number, u: number, v: number, lift = 0): V3 => {
    const b = BASIS[id];
    return [
      b.n[0] * (1 + lift) + (b.u[0] * u + b.v[0] * v) * SPAN,
      b.n[1] * (1 + lift) + (b.u[1] * u + b.v[1] * v) * SPAN,
      b.n[2] * (1 + lift) + (b.u[2] * u + b.v[2] * v) * SPAN,
    ];
  };

  const frontInfo = (rot: (p: V3) => V3) => {
    let id: FaceId = 0;
    let nz = -2;
    let n: V3 = [0, 0, 1];
    for (let i = 0; i < 6; i++) {
      const rn = rot(BASIS[i].n);
      if (rn[2] > nz) {
        nz = rn[2];
        id = i as FaceId;
        n = rn;
      }
    }
    return { id, nz, n };
  };

  const pointerUv = (x: number, y: number, id: number, cam: ReturnType<typeof view>) => {
    const o = cam.project(cam.rot(onFace(id, 0, 0)));
    const ru = cam.project(cam.rot(onFace(id, 1, 0)));
    const rv = cam.project(cam.rot(onFace(id, 0, 1)));
    const rx = ru.x - o.x;
    const ry = ru.y - o.y;
    const ux = rv.x - o.x;
    const uy = rv.y - o.y;
    const det = rx * uy - ry * ux;
    if (Math.abs(det) < 8) return null;
    const dx = x - o.x;
    const dy = y - o.y;
    return { u: (dx * uy - dy * ux) / det, v: (rx * dy - ry * dx) / det };
  };

  const widgetAt = (id: number, u: number, v: number): Mode | null => {
    if (id === 0) {
      for (let i = 0; i < BUTTONS.length; i++) {
        const b = BUTTONS[i];
        if (Math.hypot(u - b.u, v - b.v) <= b.r * 1.28) return { kind: "button", index: i };
      }
    } else if (id === 1) {
      if (Math.abs(u) < 0.42 && Math.abs(v) < 0.72) return { kind: "switch" };
    } else if (id === 2) {
      if (Math.hypot(u, v) < 0.78) return { kind: "dial", last: Math.atan2(v, u) };
    } else if (id === 3) {
      if (Math.hypot(u, v) < 0.78) return { kind: "stick" };
    } else if (id === 4) {
      if (Math.hypot(u - GEAR_A.u, v - GEAR_A.v) < GEAR_A.r * 1.15 || Math.hypot(u - GEAR_B.u, v - GEAR_B.v) < GEAR_B.r * 1.15) {
        const da = Math.hypot(u - GEAR_A.u, v - GEAR_A.v);
        const db = Math.hypot(u - GEAR_B.u, v - GEAR_B.v);
        const c = da < db ? GEAR_A : GEAR_B;
        return { kind: "gears", last: Math.atan2(v - c.v, u - c.u) };
      }
    } else if (u * u / 0.78 ** 2 + v * v / 0.58 ** 2 < 1) {
      return { kind: "stone" };
    }
    return null;
  };

  const localOf = (e: PointerEvent) => {
    const rect = el.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * w,
      y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * h,
    };
  };

  const lockPose = () => {
    yaw = Math.round(yaw / Q) * Q;
    pitch = clamp(Math.round(pitch / Q) * Q, -Q, Q);
    yawVel = 0;
    pitchVel = 0;
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    void audio.resume();
    const p = localOf(e);
    lastX = downX = p.x;
    lastY = downY = p.y;
    lastMoveAt = performance.now();
    const cam = view();
    const front = frontInfo(cam.rot);
    if (front.nz > 0.8) {
      const uv = pointerUv(p.x, p.y, front.id, cam);
      const hit = uv ? widgetAt(front.id, uv.u, uv.v) : null;
      if (hit) {
        lockPose();
        mode = hit;
        if (hit.kind === "button") {
          press[hit.index] = 1;
          audio.click(hit.index === 0 ? 0.78 : 0.55, 0.92 + hit.index * 0.07);
          haptics.tap(hit.index === 0 ? 14 : 9);
          play();
        } else if (hit.kind === "stone") {
          stoneU = uv!.u;
          stoneV = uv!.v;
        }
        return;
      }
    }
    mode = { kind: "tumble" };
  };

  const onMove = (e: PointerEvent) => {
    if (mode.kind === "none") return;
    const p = localOf(e);
    const dx = p.x - lastX;
    const dy = p.y - lastY;
    const now = performance.now();
    const dt = Math.max(0.008, (now - lastMoveAt) / 1000);
    lastX = p.x;
    lastY = p.y;
    lastMoveAt = now;

    if (mode.kind === "button" && Math.hypot(p.x - downX, p.y - downY) > 26) {
      mode = { kind: "tumble" };
    }

    if (mode.kind === "tumble") {
      const unit = view().sc * (FOV / CAM);
      const sens = 1.08 / Math.max(40, unit);
      yaw += dx * sens;
      pitch = clamp(pitch + dy * sens, -Q, Q);
      yawVel = (dx * sens) / dt;
      pitchVel = (dy * sens) / dt;
      return;
    }

    const cam = view();
    const front = frontInfo(cam.rot);
    const uv = pointerUv(p.x, p.y, front.id, cam);
    if (!uv) return;

    if (mode.kind === "switch") {
      if (Math.abs(p.x - downX) > 36 && Math.abs(p.y - downY) < 14) {
        mode = { kind: "tumble" };
        return;
      }
      const next = uv.v > 0;
      if (Math.abs(uv.v) > 0.08 && next !== switchOn) {
        switchOn = next;
        audio.switchClick(switchOn, 0.8);
        haptics.pattern([0, 12]);
        flash = 0.55;
        play();
      }
    } else if (mode.kind === "dial") {
      const a = Math.atan2(uv.v, uv.u);
      let da = a - mode.last;
      if (da > Math.PI) da -= TAU;
      if (da < -Math.PI) da += TAU;
      dial += da;
      dialVel = da / dt;
      mode = { kind: "dial", last: a };
    } else if (mode.kind === "stick") {
      const nx = clamp(uv.u / 0.62, -1, 1);
      const ny = clamp(uv.v / 0.62, -1, 1);
      const jumped = Math.hypot(nx - stickTX, ny - stickTY);
      stickTX = nx;
      stickTY = ny;
      if (jumped > 0.08) {
        audio.grain(0.12 + jumped * 0.2, 0.95);
        haptics.tap(4);
      }
    } else if (mode.kind === "gears") {
      const daA = Math.hypot(uv.u - GEAR_A.u, uv.v - GEAR_A.v);
      const db = Math.hypot(uv.u - GEAR_B.u, uv.v - GEAR_B.v);
      const c = daA < db ? GEAR_A : GEAR_B;
      const a = Math.atan2(uv.v - c.v, uv.u - c.u);
      let da = a - mode.last;
      if (da > Math.PI) da -= TAU;
      if (da < -Math.PI) da += TAU;
      const sign = c === GEAR_A ? 1 : -GEAR_A.teeth / GEAR_B.teeth;
      gear += da * sign;
      gearVel = (da * sign) / dt;
      mode = { kind: "gears", last: a };
    } else if (mode.kind === "stone") {
      const moved = Math.hypot(uv.u - stoneU, uv.v - stoneV);
      stoneU = uv.u;
      stoneV = uv.v;
      if (moved > 0.02) {
        stoneGlow = Math.min(1, stoneGlow + moved * 1.4);
        audio.grain(0.1 + moved * 0.35, 0.72);
      }
    }
  };

  const onUp = () => {
    if (mode.kind === "none") return;
    if (mode.kind === "tumble") {
      if (performance.now() - lastMoveAt > 80) {
        yawVel = 0;
        pitchVel = 0;
      } else if (Math.hypot(yawVel, pitchVel) > 5.5) {
        audio.whoosh(Math.min(0.7, Math.hypot(yawVel, pitchVel) / 14));
      }
    } else if (mode.kind === "switch" && Math.hypot(lastX - downX, lastY - downY) < 12) {
      switchOn = !switchOn;
      audio.switchClick(switchOn, 0.8);
      haptics.pattern([0, 12]);
      flash = 0.55;
      play();
    } else if (mode.kind === "stick") {
      if (Math.hypot(stickTX, stickTY) > 0.35) {
        audio.click(0.3, 1.2);
        haptics.tap(8);
        play();
      }
      stickTX = 0;
      stickTY = 0;
    } else if (mode.kind === "stone") {
      if (stoneGlow > 0.35) play();
    } else if (mode.kind === "button") {
      flash = 0.35;
    }
    mode = { kind: "none" };
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  el.style.touchAction = "none";

  const fillPoly = (pts: { x: number; y: number }[], color: number, alpha = 1) => {
    if (pts.length < 3) return;
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.fill({ color, alpha });
  };

  const strokePoly = (pts: { x: number; y: number }[], width: number, color: number, alpha: number) => {
    if (pts.length < 2) return;
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.stroke({ width, color, alpha });
  };

  const disc = (
    cam: ReturnType<typeof view>,
    id: number,
    u: number,
    v: number,
    r: number,
    lift: number,
    color: number,
    alpha = 1,
    samples = 18,
  ) => {
    const pts = [];
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * TAU;
      pts.push(cam.project(cam.rot(onFace(id, u + Math.cos(a) * r, v + Math.sin(a) * r, lift))));
    }
    fillPoly(pts, color, alpha);
    return pts;
  };

  const drawGear = (cam: ReturnType<typeof view>, u: number, v: number, radius: number, teeth: number, angle: number, color: number) => {
    const id = 4;
    for (let i = 0; i < teeth; i++) {
      const a0 = angle + (i / teeth) * TAU;
        const a1 = a0 + (TAU / teeth) * 0.55;
      const inner = radius * 0.62;
      const pts = [a0, a0, a1, a1].map((a, k) => {
        const rad = k === 0 || k === 3 ? inner : radius;
        return cam.project(cam.rot(onFace(id, u + Math.cos(a) * rad, v + Math.sin(a) * rad, 0.035)));
      });
      fillPoly(pts, kshade(color, 0.55 + (i % 2) * 0.18));
    }
    disc(cam, id, u, v, radius * 0.62, 0.05, kshade(color, 0.72));
    disc(cam, id, u, v, radius * 0.22, 0.07, kshade(0x2a2622, 1));
    disc(cam, id, u - radius * 0.08, v + radius * 0.1, radius * 0.08, 0.09, 0xffffff, 0.28);
  };

  return {
    update(dt: number) {
      clock += dt;
      const dragging = mode.kind === "tumble";
      if (!dragging) {
        const speed = Math.hypot(yawVel, pitchVel);
        if (speed < 2.35) {
          const ty = Math.round(yaw / Q) * Q;
          const tp = clamp(Math.round(pitch / Q) * Q, -Q, Q);
          const k = 1 - Math.exp(-dt * 14);
          yaw += (ty - yaw) * k;
          pitch += (tp - pitch) * k;
          yawVel *= Math.exp(-dt * 9);
          pitchVel *= Math.exp(-dt * 9);
        } else {
          yaw += yawVel * dt;
          pitch += pitchVel * dt;
          const damp = Math.exp(-dt * 1.28);
          yawVel *= damp;
          pitchVel *= damp;
        }
        pitch = clamp(pitch, -Q, Q);
      }

      const key = `${Math.round(yaw / Q)}:${Math.round(pitch / Q)}`;
      if (poseKey === null) poseKey = key;
      else if (key !== poseKey) {
        poseKey = key;
        audio.click(0.34, 0.96);
        haptics.tap(7);
        flash = 0.8;
        const cam = view();
        noteFace(frontInfo(cam.rot).id);
        play();
      }

      switchT += ((switchOn ? 1 : 0) - switchT) * Math.min(1, dt * 16);
      for (let i = 0; i < press.length; i++) {
        const target = mode.kind === "button" && mode.index === i ? 1 : 0;
        press[i] += (target - press[i]) * Math.min(1, dt * 22);
      }
      if (mode.kind !== "dial") {
        dial += dialVel * dt;
        dialVel *= Math.exp(-dt * 3.4);
        if (Math.abs(dialVel) < 0.35) dialVel = 0;
      }
      {
        const step = Math.round(dial / (TAU / 16));
        if (step !== dialStep && (mode.kind === "dial" || Math.abs(dialVel) > 0.25)) {
          audio.click(0.2, 1.18);
          haptics.tap(4);
          play();
        }
        dialStep = step;
      }
      stickX += (stickTX - stickX) * Math.min(1, dt * 16);
      stickY += (stickTY - stickY) * Math.min(1, dt * 16);
      if (mode.kind !== "gears") {
        gear += gearVel * dt;
        gearVel *= Math.exp(-dt * 1.7);
        if (Math.abs(gearVel) < 0.25) gearVel = 0;
      }
      {
        const step = Math.round(gear / (TAU / GEAR_A.teeth));
        if (step !== gearStep && (mode.kind === "gears" || Math.abs(gearVel) > 0.45)) {
          if (Math.abs(step - gearStep) < 6) {
            audio.click(0.16, 1.32);
            if (step % 2 === 0) haptics.tap(3);
            if (step % 4 === 0) play();
          }
        }
        gearStep = step;
      }
      stoneGlow = Math.max(0, stoneGlow - dt * 0.55);
      flash = Math.max(0, flash - dt * 1.7);

      const cam = view();
      const front = frontInfo(cam.rot);
      const speed = Math.hypot(yawVel, pitchVel);
      const settle =
        smoothstep(0.78, 0.97, front.nz) * (1 - smoothstep(0.35, 2.4, dragging ? 3 : speed)) * (dragging ? 0.35 : 1);

      if (!greeted && !dragging && settle > 0.92) {
        greeted = true;
        audio.click(0.22, 0.9);
        haptics.tap(6);
        noteFace(front.id);
      }

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x101216, alpha: 1 });
      g.circle(cam.cx, cam.cy - h * 0.28, Math.max(w, h) * 0.62);
      g.fill({ color: 0x1a2128, alpha: 0.85 });

      const shadowW = cam.sc * 1.55 * (1 - Math.min(0.22, speed * 0.02));
      g.ellipse(cam.cx, cam.cy + cam.sc * 1.22, shadowW, cam.sc * 0.28);
      g.fill({ color: 0x000000, alpha: 0.38 });

      const drawn = MESH.map((poly) => {
        const n = cam.rot(poly.n);
        const pts = poly.pts.map((p) => cam.project(cam.rot(p)));
        const z = pts.reduce((s, p) => s + p.z, 0) / pts.length;
        return { poly, n, pts, z };
      })
        .filter((d) => d.n[2] > -0.04)
        .sort((a, b) => a.z - b.z);

      for (const d of drawn) {
        const shade = 0.36 + Math.max(0, dot(d.n, LIGHT)) * 0.78 + Math.max(0, d.n[2]) * 0.1;
        const faceId = d.poly.face;
        if (faceId === -1) {
          fillPoly(d.pts, tint(0x242a32, shade * 0.92));
          continue;
        }
        const color = FACE_COLOR[faceId];
        fillPoly(d.pts, tint(color, shade * 0.62));
        const panel = insetPts(d.pts, 0.2);
        fillPoly(panel, tint(color, shade));
        if (d.n[2] > 0.35) {
          strokePoly(panel, 1.25, 0xffffff, 0.08 + d.n[2] * 0.06);
        }
        if (d.n[2] > 0.18) drawWidgets(cam, faceId, shade);
        if (faceId === front.id && flash > 0.04 && d.n[2] > 0.5) {
          strokePoly(panel, 2.5, 0xffffff, flash * 0.45);
        }
      }

      labelText.text = FACE_NAME[front.id].toUpperCase();
      const labelW = Math.max(76, labelText.width + 28);
      const ly = cam.cy + cam.sc * 1.48;
      labelText.alpha = settle;
      labelText.position.set(cam.cx, ly);
      if (settle > 0.04) {
        g.roundRect(cam.cx - labelW / 2, ly - 14, labelW, 28, 14);
        g.fill({ color: 0x000000, alpha: 0.4 * settle });
      }
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    destroy() {
      hud.destroy();
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      layer.destroy({ children: true });
    },
  };

  function drawWidgets(cam: ReturnType<typeof view>, id: FaceId, shade: number) {
    if (id === 0) {
      for (let i = 0; i < BUTTONS.length; i++) {
        const b = BUTTONS[i];
        const depth = press[i];
        const r = b.r * (1 - depth * 0.22);
        disc(cam, id, b.u, b.v, b.r * 1.22, 0.008, tint(0x140e0c, 0.85), 0.72);
        const cap = i === 0 ? 0xf3ebe3 : 0xe7ddd2;
        disc(cam, id, b.u, b.v, r, 0.05 - depth * 0.06, tint(cap, 0.78 + shade * 0.28 - depth * 0.38));
        disc(
          cam,
          id,
          b.u - r * 0.28,
          b.v + r * 0.32,
          r * 0.36,
          0.06 - depth * 0.03,
          0xffffff,
          0.34 - depth * 0.2,
        );
      }
    } else if (id === 1) {
      const track = pill(cam, id, 0, -0.58, 0.58, 0.2, 0.01);
      fillPoly(track, tint(0x14181c, 0.7 + shade * 0.3));
      const ly = -0.36 + switchT * 0.72;
      const lever = pill(cam, id, 0, ly - 0.2, ly + 0.2, 0.26, 0.05);
      fillPoly(lever, tint(0xf2efe6, 0.75 + shade * 0.3));
      disc(cam, id, 0, ly + 0.05, 0.07, 0.07, 0xffffff, 0.35);
      disc(cam, id, 0, 0.7, 0.05, 0.02, switchOn ? 0xf0e6c8 : 0x2a3038, 0.9);
      disc(cam, id, 0, -0.7, 0.05, 0.02, switchOn ? 0x2a3038 : 0xd7cfc2, 0.9);
    } else if (id === 2) {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        disc(cam, id, Math.cos(a) * 0.58, Math.sin(a) * 0.58, 0.035, 0.02, tint(0x2a241c, 0.8 + shade * 0.4));
      }
      disc(cam, id, 0, 0, 0.46, 0.02, tint(0x3a3228, 0.55 + shade * 0.45));
      for (let i = 0; i < 18; i++) {
        const a0 = dial + (i / 18) * TAU;
        const a1 = a0 + 0.12;
        const pts = [0.2, 0.44, 0.44, 0.2].map((rad, k) => {
          const a = k < 2 ? a0 : a1;
          return cam.project(cam.rot(onFace(id, Math.cos(a) * rad, Math.sin(a) * rad, 0.045)));
        });
        fillPoly(pts, tint(i % 2 === 0 ? 0xe6c48a : 0xb08958, 0.7 + shade * 0.35));
      }
      disc(cam, id, 0, 0, 0.16, 0.06, tint(0xf0e2c4, 0.8 + shade * 0.25));
      const nib = [
        cam.project(cam.rot(onFace(id, Math.cos(dial) * 0.18, Math.sin(dial) * 0.18, 0.07))),
        cam.project(cam.rot(onFace(id, Math.cos(dial) * 0.4, Math.sin(dial) * 0.4, 0.07))),
      ];
      g.moveTo(nib[0].x, nib[0].y);
      g.lineTo(nib[1].x, nib[1].y);
      g.stroke({ width: 3, color: 0xfff6ea, alpha: 0.9 });
    } else if (id === 3) {
      disc(cam, id, 0, 0, 0.62, 0.005, tint(0x142018, 0.65 + shade * 0.3));
      strokeLoop(cam, id, 0, 0, 0.62, 0.02, 0xffffff, 0.12);
      for (const [u, v] of [
        [0, 0.48],
        [0, -0.48],
        [0.48, 0],
        [-0.48, 0],
      ] as const) {
        disc(cam, id, u, v, 0.035, 0.02, 0xffffff, 0.28);
      }
      const sx = stickX * 0.42;
      const sy = stickY * 0.42;
      disc(cam, id, sx, sy, 0.16, 0.02, tint(0x1c2a22, 0.8));
      disc(cam, id, sx, sy, 0.24, 0.055, tint(0xe7f0e4, 0.75 + shade * 0.3));
      disc(cam, id, sx - 0.07, sy + 0.08, 0.08, 0.07, 0xffffff, 0.32);
    } else if (id === 4) {
      disc(cam, id, 0, 0, 0.08, 0.02, tint(0x241e18, 0.9), 0.35);
      drawGear(cam, GEAR_A.u, GEAR_A.v, GEAR_A.r, GEAR_A.teeth, gear, 0xd9d2c6);
      drawGear(
        cam,
        GEAR_B.u,
        GEAR_B.v,
        GEAR_B.r,
        GEAR_B.teeth,
        -gear * (GEAR_A.teeth / GEAR_B.teeth) + Math.PI / GEAR_B.teeth,
        0xc4bbb0,
      );
    } else {
      const oval = ellipsePoly(cam, id, 0, 0, 0.74, 0.56, 0.012, 28);
      fillPoly(oval, tint(0x15202c, 0.7 + shade * 0.35));
      const stone = ellipsePoly(cam, id, 0, 0, 0.66, 0.48, 0.03, 28);
      fillPoly(stone, tint(0xd5e2ee, 0.78 + shade * 0.28));
      disc(cam, id, -0.12, 0.16, 0.22, 0.045, 0xffffff, 0.22);
      disc(cam, id, stoneU * 0.45, stoneV * 0.4, 0.16 + stoneGlow * 0.1, 0.055, 0xffffff, 0.16 + stoneGlow * 0.5);
      strokeLoop(cam, id, 0, 0, 0.5, 0.035, 0xffffff, 0.08, 0.5 / 0.66);
    }
  }

  function pill(
    cam: ReturnType<typeof view>,
    id: number,
    u: number,
    v0: number,
    v1: number,
    rad: number,
    lift: number,
  ) {
    const pts: { x: number; y: number; z: number }[] = [];
    const steps = 7;
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI + (i / steps) * Math.PI;
      pts.push(cam.project(cam.rot(onFace(id, u + Math.cos(a) * rad, v0 + Math.sin(a) * rad, lift))));
    }
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI;
      pts.push(cam.project(cam.rot(onFace(id, u + Math.cos(a) * rad, v1 + Math.sin(a) * rad, lift))));
    }
    return pts;
  }

  function ellipsePoly(
    cam: ReturnType<typeof view>,
    id: number,
    u: number,
    v: number,
    rx: number,
    ry: number,
    lift: number,
    samples: number,
  ) {
    const pts = [];
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * TAU;
      pts.push(cam.project(cam.rot(onFace(id, u + Math.cos(a) * rx, v + Math.sin(a) * ry, lift))));
    }
    return pts;
  }

  function strokeLoop(
    cam: ReturnType<typeof view>,
    id: number,
    u: number,
    v: number,
    r: number,
    lift: number,
    color: number,
    alpha: number,
    aspect = 1,
  ) {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * TAU;
      pts.push(cam.project(cam.rot(onFace(id, u + Math.cos(a) * r, v + Math.sin(a) * r * aspect, lift))));
    }
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.stroke({ width: 2, color, alpha });
  }
}

function insetPts(pts: { x: number; y: number }[], amount: number) {
  const c = pts.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
  c.x /= pts.length;
  c.y /= pts.length;
  return pts.map((p) => ({ x: c.x + (p.x - c.x) * (1 - amount), y: c.y + (p.y - c.y) * (1 - amount) }));
}

function outward(pts: V3[]): V3 {
  const n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
  const c = pts.reduce<V3>((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]);
  return dot(n, c) < 0 ? normalize([-n[0], -n[1], -n[2]]) : normalize(n);
}

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: V3, b: V3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function dist(a: V3, b: V3) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function normalize(p: V3): V3 {
  const l = Math.hypot(p[0], p[1], p[2]) || 1;
  return [p[0] / l, p[1] / l, p[2] / l];
}

function tint(hex: number, m: number) {
  const r = clamp8(((hex >> 16) & 255) * m);
  const g = clamp8(((hex >> 8) & 255) * m);
  const b = clamp8((hex & 255) * m);
  return (r << 16) | (g << 8) | b;
}

function kshade(hex: number, m: number) {
  return tint(hex, m);
}

function clamp8(n: number) {
  return Math.max(0, Math.min(255, n | 0));
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export const fidgetCube: ExperienceModule = {
  id: "fidget-cube",
  collection: "field",
  name: "Fidget Cube",
  modality: "Fidget",
  tagline: "Turn the cube. Each face is its own fidget.",
  hint: "Drag to turn it. Play the face that lands toward you.",
  accent: "#c45a4a",
  mount,
};
