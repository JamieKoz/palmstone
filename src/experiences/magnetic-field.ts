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
type Magnet = { x: number; y: number; attract: boolean; r: number };

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

  const filings: Filing[] = Array.from({ length: 340 }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: 0,
    vy: 0,
    ang: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.4,
  }));

  const magnets: Magnet[] = [
    { x: w * 0.34, y: h * 0.48, attract: true, r: 34 },
    { x: w * 0.66, y: h * 0.52, attract: false, r: 30 },
  ];

  let drag: number | null = null;
  let pointerDown = false;
  let px = 0;
  let py = 0;
  let lastTap = 0;
  let lastTapMagnet = -1;
  let whoosh = 0;
  let clingGate = 0;

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
    pointerDown = true;
    void audio.resume();
    const hit = nearestMagnet(px, py);
    const now = performance.now();
    if (hit >= 0 && hit === lastTapMagnet && now - lastTap < 280) {
      magnets[hit].attract = !magnets[hit].attract;
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

  return {
    update(dt: number) {
      if (drag != null) {
        const m = magnets[drag];
        m.x += (px - m.x) * Math.min(1, dt * 14);
        m.y += (py - m.y) * Math.min(1, dt * 14);
      }

      const finger = pointerDown && drag == null;
      let energy = 0;
      let stuck = 0;

      for (const f of filings) {
        let fx = 0;
        let fy = 0;
        const sources: { x: number; y: number; attract: boolean; reach: number }[] = magnets.map(
          (m) => ({ x: m.x, y: m.y, attract: m.attract, reach: m.r }),
        );
        if (finger) sources.push({ x: px, y: py, attract: true, reach: 26 });

        for (const s of sources) {
          const dx = s.x - f.x;
          const dy = s.y - f.y;
          const d = Math.hypot(dx, dy) || 1;
          const dir = s.attract ? 1 : -1;
          const falloff = (18000 * strength) / (d * d + 120);
          fx += (dx / d) * falloff * dir;
          fy += (dy / d) * falloff * dir;
          fx += (-dy / d) * dir * 28 * strength;
          fy += (dx / d) * dir * 28 * strength;
          if (s.attract && d < s.reach + 14 + strength * 6) {
            const grip = (s.reach + 8 + strength * 4 - d) * (70 + strength * 24);
            fx += (dx / d) * grip;
            fy += (dy / d) * grip;
            if (d < s.reach + 8) stuck += 1;
          }
        }

        f.vx = (f.vx + fx * dt) * 0.9;
        f.vy = (f.vy + fy * dt) * 0.9;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        const spd = Math.hypot(f.vx, f.vy);
        energy += spd;
        const aim = Math.atan2(fy, fx);
        let da = aim - f.ang;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        f.ang += da * Math.min(1, dt * 10);
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
  collection: "studio",
  name: "Magnetic Field",
  modality: "Force",
  tagline: "Drag the magnets — filings cling to one pole and flee the other.",
  hint: "Drag a disc, or the empty space. Pull sets how hard the field grabs. Double-tap to flip a pole.",
  accent: "#7eb6c9",
  mount,
};
