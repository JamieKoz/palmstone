import { Container, Graphics } from "pixi.js";
import { createHud } from "@/engine/hud";
import { gravityFromFeel } from "@/engine/storage";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Filing = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ang: number;
  spin: number;
};
/** `attract` is the north/positive pole (cyan). False is the south/negative pole (orange). */
type Magnet = { x: number; y: number; attract: boolean; r: number; vx: number; vy: number };
type Star = { x: number; y: number; z: number; r: number; a: number; warm: boolean };

const FIELD_SOFT = 26;
const POLE_K = 9800;

/**
 * Magnetic Field — two hand magnets and a bed of iron filings.
 * Drag a magnet and the filings cling or scatter. Double-tap one to flip its pole.
 */
function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  const canvas = ctx.app.canvas;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  const host = ctx.app.canvas.parentElement ?? document.body;
  const hud = createHud(host);
  let strength = Math.min(2.6, Math.max(0.4, gravityFromFeel()));
  hud.slider("Pull", 0.4, 2.6, strength, (v) => {
    strength = v;
  });
  const baseMagnetR = [34, 30];
  hud.slider("Size", 0.55, 1.8, 1, (v) => {
    magnets.forEach((m, i) => {
      m.r = baseMagnetR[i] * v;
    });
  });

  const filings: Filing[] = Array.from({ length: 340 }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: 0,
    vy: 0,
    ang: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.4,
  }));
  const sepX = new Float32Array(filings.length);
  const sepY = new Float32Array(filings.length);

  const magnets: Magnet[] = [
    { x: w * 0.34, y: h * 0.48, attract: true, r: 34, vx: 0, vy: 0 },
    { x: w * 0.66, y: h * 0.52, attract: false, r: 30, vx: 0, vy: 0 },
  ];

  const stars: Star[] = Array.from({ length: 128 }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    z: 0.22 + Math.random() * 0.78,
    r: Math.random() < 0.82 ? 0.45 + Math.random() * 1.05 : 1.4 + Math.random() * 1.1,
    a: 0.12 + Math.random() * 0.42,
    warm: Math.random() < 0.14,
  }));

  let drag: number | null = null;
  let pointerDown = false;
  let px = 0;
  let py = 0;
  let prevPX = 0;
  let prevPY = 0;
  let lastTap = 0;
  let lastTapMagnet = -1;
  let whoosh = 0;
  let clingGate = 0;
  let kickX = 0;
  let kickY = 0;
  let starTime = 0;

  const b0 = { bx: 0, by: 0, mag: 0 };
  const bX = { bx: 0, by: 0, mag: 0 };
  const bY = { bx: 0, by: 0, mag: 0 };

  const local = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * w,
      y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * h,
    };
  };

  const nearestMagnet = (x: number, y: number) => {
    let best = -1;
    let bestD = 48;
    for (let i = 0; i < magnets.length; i++) {
      const d = Math.hypot(magnets[i].x - x, magnets[i].y - y);
      if (d < magnets[i].r + 22 && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  const onDown = (e: PointerEvent) => {
    const p = local(e);
    px = p.x;
    py = p.y;
    prevPX = p.x;
    prevPY = p.y;
    pointerDown = true;
    void audio.resume();
    const hit = nearestMagnet(px, py);
    const now = performance.now();
    if (hit >= 0 && hit === lastTapMagnet && now - lastTap < 280) {
      magnets[hit].attract = !magnets[hit].attract;
      magnets[hit].vx = 0;
      magnets[hit].vy = 0;
      audio.pulse(0.45);
      haptics.tap(16);
      drag = null;
      lastTap = 0;
      return;
    }
    lastTap = now;
    lastTapMagnet = hit;
    drag = hit;
    if (hit >= 0) {
      audio.click(0.32, magnets[hit].attract ? 1.15 : 0.72);
      haptics.tap(12);
    }
  };
  const onMove = (e: PointerEvent) => {
    const p = local(e);
    px = p.x;
    py = p.y;
  };
  const onUp = () => {
    pointerDown = false;
    drag = null;
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  canvas.style.touchAction = "none";

  const writeField = (
    x: number,
    y: number,
    out: { bx: number; by: number; mag: number },
  ) => {
    let bx = 0;
    let by = 0;
    for (let i = 0; i < magnets.length; i++) {
      const m = magnets[i];
      const dx = x - m.x;
      const dy = y - m.y;
      const d2 = dx * dx + dy * dy + FIELD_SOFT * FIELD_SOFT;
      const invD = 1 / Math.sqrt(d2);
      const q = m.attract ? 1 : -1;
      const mag = (q * strength * POLE_K * invD) / d2;
      bx += dx * mag;
      by += dy * mag;
    }
    out.bx = bx;
    out.by = by;
    out.mag = Math.hypot(bx, by);
  };

  return {
    update(dt: number) {
      if (pointerDown) {
        kickX += -(px - prevPX) * 2.4;
        kickY += -(py - prevPY) * 2.4;
      }
      prevPX = px;
      prevPY = py;
      const kickMag = Math.hypot(kickX, kickY);
      if (kickMag > 460) {
        kickX = (kickX / kickMag) * 460;
        kickY = (kickY / kickMag) * 460;
      }
      const kickDamp = Math.exp(-2.4 * dt);
      kickX *= kickDamp;
      kickY *= kickDamp;
      starTime += dt;

      const driftX = 12 + kickX;
      const driftY = 4.5 + kickY;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        s.x += driftX * s.z * dt;
        s.y += driftY * s.z * dt;
        if (s.x < 0) s.x += w;
        else if (s.x > w) s.x -= w;
        if (s.y < 0) s.y += h;
        else if (s.y > h) s.y -= h;
      }

      const q1 = magnets[0].attract ? 1 : -1;
      const q2 = magnets[1].attract ? 1 : -1;
      const dx = magnets[1].x - magnets[0].x;
      const dy = magnets[1].y - magnets[0].y;
      const dist = Math.hypot(dx, dy) || 1;
      const couple = (q1 * q2 * 5.2e6 * strength) / (dist * dist + 70 * 70);
      let fx0 = (-dx / dist) * couple;
      let fy0 = (-dy / dist) * couple;
      const minD = magnets[0].r + magnets[1].r + 28;
      if (dist < minD) {
        const push = (minD - dist) * (96 + strength * 24);
        fx0 += (-dx / dist) * push;
        fy0 += (-dy / dist) * push;
      }

      for (let i = 0; i < magnets.length; i++) {
        if (drag === i) continue;
        const m = magnets[i];
        let ax = i === 0 ? fx0 : -fx0;
        let ay = i === 0 ? fy0 : -fy0;
        const margin = m.r + 18;
        if (m.x < margin) ax += (margin - m.x) * 18;
        if (m.x > w - margin) ax -= (m.x - (w - margin)) * 18;
        if (m.y < margin) ay += (margin - m.y) * 18;
        if (m.y > h - margin) ay -= (m.y - (h - margin)) * 18;
        const damp = Math.exp(-1.45 * dt);
        m.vx = (m.vx + ax * dt) * damp;
        m.vy = (m.vy + ay * dt) * damp;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
      }

      if (drag != null) {
        const m = magnets[drag];
        const nx = m.x + (px - m.x) * Math.min(1, dt * 14);
        const ny = m.y + (py - m.y) * Math.min(1, dt * 14);
        m.vx = (nx - m.x) / Math.max(dt, 0.001);
        m.vy = (ny - m.y) / Math.max(dt, 0.001);
        m.x = nx;
        m.y = ny;
      }

      const sameSign = q1 === q2;
      const streamSign = sameSign && q1 < 0 ? -1 : 1;
      const finger = pointerDown && drag == null;
      let energy = 0;
      let stuck = 0;
      sepX.fill(0);
      sepY.fill(0);

      const n = filings.length;
      for (let i = 0; i < n; i++) {
        const f = filings[i];
        for (let j = i + 1; j < n; j++) {
          const o = filings[j];
          const ox = f.x - o.x;
          const oy = f.y - o.y;
          const d2 = ox * ox + oy * oy;
          if (d2 > 144 || d2 < 0.04) continue;
          const d = Math.sqrt(d2);
          const push = (12 - d) * 64;
          const pxv = (ox / d) * push;
          const pyv = (oy / d) * push;
          sepX[i] += pxv;
          sepY[i] += pyv;
          sepX[j] -= pxv;
          sepY[j] -= pyv;
        }
      }

      for (let i = 0; i < n; i++) {
        const f = filings[i];
        writeField(f.x, f.y, b0);
        writeField(f.x + 4, f.y, bX);
        writeField(f.x, f.y + 4, bY);
        const gx = (bX.mag - b0.mag) / 4;
        const gy = (bY.mag - b0.mag) / 4;
        const bmag = b0.mag || 1;
        const stream = 86 * strength * Math.min(1, b0.mag * 2.3);
        let fx = gx * 4600 + (b0.bx / bmag) * streamSign * stream + sepX[i];
        let fy = gy * 4600 + (b0.by / bmag) * streamSign * stream + sepY[i];

        if (finger) {
          const fdx = px - f.x;
          const fdy = py - f.y;
          const fd = Math.hypot(fdx, fdy) || 1;
          const falloff = (15000 * strength) / (fd * fd + 140);
          fx += (fdx / fd) * falloff;
          fy += (fdy / fd) * falloff;
          if (fd < 42) {
            const grip = (42 - fd) * (48 + strength * 16);
            fx += (fdx / fd) * grip;
            fy += (fdy / fd) * grip;
          }
        }

        for (let mi = 0; mi < magnets.length; mi++) {
          const m = magnets[mi];
          if (Math.hypot(m.x - f.x, m.y - f.y) < m.r + 10) stuck += 1;
        }

        f.vx = (f.vx + fx * dt) * 0.9;
        f.vy = (f.vy + fy * dt) * 0.9;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        const spd = Math.hypot(f.vx, f.vy);
        energy += spd;

        let aimX = b0.bx * streamSign;
        let aimY = b0.by * streamSign;
        if (finger) {
          aimX += fx * 0.02;
          aimY += fy * 0.02;
        }
        if (aimX * aimX + aimY * aimY > 0.0004) {
          const aim = Math.atan2(aimY, aimX);
          let da = aim - f.ang;
          if (da > Math.PI) da -= Math.PI * 2;
          if (da < -Math.PI) da += Math.PI * 2;
          f.ang += da * Math.min(1, dt * 10);
        }
        f.spin = spd * 0.004;

        if (f.x < 4) f.x = w - 8;
        if (f.x > w - 4) f.x = 8;
        if (f.y < 4) f.y = h - 8;
        if (f.y > h - 4) f.y = 8;
      }

      whoosh += energy * dt * 0.00004;
      if (whoosh > 1.6 && energy > 18000) {
        audio.whoosh(Math.min(0.4, energy / 140000));
        whoosh = 0;
      }
      clingGate += dt;
      if (stuck > 36 && clingGate > 0.14) {
        haptics.tap(4);
        audio.grain(0.14, 1.5);
        clingGate = 0;
      }

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x10141c, alpha: 1 });

      const streak = Math.hypot(kickX, kickY);
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const tw = 0.72 + 0.28 * Math.sin(starTime * (0.45 + s.z * 0.5) + i * 0.7);
        const alpha = s.a * tw;
        const color = s.warm ? 0xd2c6b0 : 0xc5d0dc;
        if (streak > 36) {
          const len = Math.min(16, streak * s.z * 0.032);
          const inv = len / streak;
          g.moveTo(s.x, s.y);
          g.lineTo(s.x - kickX * inv, s.y - kickY * inv);
          g.stroke({ width: Math.max(0.6, s.r * 0.85), color, alpha });
        } else {
          g.circle(s.x, s.y, s.r);
          g.fill({ color, alpha });
        }
      }

      for (const f of filings) {
        const len = 7 + Math.min(6, Math.hypot(f.vx, f.vy) / 180);
        const c = Math.cos(f.ang);
        const s = Math.sin(f.ang);
        g.moveTo(f.x - c * len, f.y - s * len);
        g.lineTo(f.x + c * len, f.y + s * len);
        g.stroke({ width: 2.2, color: 0xd7c3a4, alpha: 0.72 });
      }

      if (finger) {
        g.circle(px, py, 22);
        g.stroke({ width: 2, color: 0xe7eef6, alpha: 0.7 });
        g.circle(px, py, 5);
        g.fill({ color: 0xf4f7fb, alpha: 0.95 });
      }

      for (const m of magnets) {
        const color = m.attract ? 0x7eb6c9 : 0xd08972;
        g.circle(m.x, m.y, m.r + 8 + strength * 14);
        g.fill({ color, alpha: 0.12 });
        g.circle(m.x, m.y, m.r);
        g.fill({ color: 0x1a222c, alpha: 1 });
        g.circle(m.x, m.y, m.r);
        g.stroke({ width: 4, color, alpha: 0.95 });
        g.circle(m.x, m.y, m.r * 0.42);
        g.fill({ color, alpha: 0.9 });
        if (!m.attract) {
          g.moveTo(m.x - 8, m.y);
          g.lineTo(m.x + 8, m.y);
          g.stroke({ width: 2, color: 0x1a222c, alpha: 0.8 });
        }
      }
    },
    resize(nw, nh) {
      const sx = nw / Math.max(1, w);
      const sy = nh / Math.max(1, h);
      w = nw;
      h = nh;
      for (const m of magnets) {
        m.x *= sx;
        m.y *= sy;
      }
      for (const f of filings) {
        f.x *= sx;
        f.y *= sy;
      }
      for (const s of stars) {
        s.x *= sx;
        s.y *= sy;
      }
    },
    destroy() {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      hud.destroy();
      layer.destroy({ children: true });
    },
  };
}

export const magneticField: ExperienceModule = {
  id: "magnetic-field",
  collection: "field",
  name: "Magnetic Field",
  modality: "Force",
  tagline: "Drag the magnets — filings cling to one pole and flee the other.",
  hint: "Drag a disc, or the empty space. Pull sets how hard the field grabs. Double-tap to flip a pole.",
  accent: "#7eb6c9",
  mount,
};
