import { Container, Graphics } from "pixi.js";
import { createHud } from "@/engine/hud";
import { gravityFromFeel } from "@/engine/storage";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  trail: { x: number; y: number }[];
};
type Well = { x: number; y: number; strength: number };

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  const host = ctx.app.canvas.parentElement ?? document.body;
  const hud = createHud(host);
  let gravityMul = gravityFromFeel();
  hud.slider("Gravity", 0.35, 2.4, gravityMul, (v) => {
    gravityMul = v;
  });

  const particles: Particle[] = Array.from({ length: 180 }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: 0,
    vy: 0,
    trail: [],
  }));

  const wells: Well[] = [
    { x: w * 0.32, y: h * 0.42, strength: 1 },
    { x: w * 0.68, y: h * 0.58, strength: -0.9 },
  ];

  let dragWell: number | null = null;
  let pointerDown = false;
  let px = 0;
  let py = 0;
  let whooshAcc = 0;
  let passAcc = 0;

  const nearestWell = (x: number, y: number) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < wells.length; i++) {
      const d = Math.hypot(wells[i].x - x, wells[i].y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return bestD < 72 ? best : null;
  };

  const onDown = (e: PointerEvent) => {
    pointerDown = true;
    px = e.clientX;
    py = e.clientY;
    dragWell = nearestWell(px, py);
    void audio.resume();
    if (dragWell != null) {
      haptics.tap(12);
      audio.click(0.3, wells[dragWell].strength > 0 ? 1.1 : 0.7);
    }
  };
  const onMove = (e: PointerEvent) => {
    px = e.clientX;
    py = e.clientY;
  };
  const onUp = () => {
    pointerDown = false;
    dragWell = null;
  };
  const onDbl = (e: MouseEvent) => {
    wells.push({
      x: e.clientX,
      y: e.clientY,
      strength: wells.length % 2 === 0 ? 1 : -0.9,
    });
    if (wells.length > 5) wells.shift();
    audio.pulse(0.35);
    haptics.tap(16);
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.addEventListener("dblclick", onDbl);
  el.style.touchAction = "none";

  let lastTap = 0;
  const onPointerDownTap = (e: PointerEvent) => {
    const t = performance.now();
    if (t - lastTap < 280 && nearestWell(e.clientX, e.clientY) == null) {
      onDbl(e);
    }
    lastTap = t;
  };
  el.addEventListener("pointerdown", onPointerDownTap);

  function accel(x: number, y: number) {
    let ax = 0;
    let ay = 0;
    const sources: Well[] = wells.slice();
    if (pointerDown && dragWell == null) {
      sources.push({ x: px, y: py, strength: 0.72 });
    }
    for (const well of sources) {
      const dx = well.x - x;
      const dy = well.y - y;
      const d2 = dx * dx + dy * dy + 90;
      const d = Math.sqrt(d2);
      const f = (well.strength * 26000 * gravityMul) / d2;
      ax += (dx / d) * f;
      ay += (dy / d) * f;
      ax += (-dy / d) * well.strength * 18 * gravityMul;
      ay += (dx / d) * well.strength * 18 * gravityMul;
    }
    return { ax, ay };
  }

  return {
    update(dt: number) {
      if (dragWell != null) {
        wells[dragWell].x = px;
        wells[dragWell].y = py;
      }

      let energy = 0;
      let passes = 0;
      for (const p of particles) {
        const a = accel(p.x, p.y);
        p.vx = (p.vx + a.ax * dt) * 0.986;
        p.vy = (p.vy + a.ay * dt) * 0.986;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < 0) p.x += w;
        if (p.x > w) p.x -= w;
        if (p.y < 0) p.y += h;
        if (p.y > h) p.y -= h;
        const spd = Math.hypot(p.vx, p.vy);
        energy += spd;
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 6) p.trail.shift();
        if (spd > 220) {
          for (const well of wells) {
            if (Math.hypot(well.x - p.x, well.y - p.y) < 36) passes += 1;
          }
        }
      }

      whooshAcc += energy * dt * 0.00008;
      if (whooshAcc > 2.2 && energy > 25000) {
        audio.whoosh(Math.min(0.45, energy / 120000));
        whooshAcc = 0;
      }
      passAcc += passes;
      if (passAcc > 14) {
        haptics.tap(5);
        audio.grain(0.16, 1.6);
        passAcc = 0;
      }

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x10141c, alpha: 1 });

      for (const well of wells) {
        const attract = well.strength > 0;
        const color = attract ? 0x7eb6c9 : 0xc97e6a;
        for (let i = 0; i < 7; i++) {
          const ang = (i / 7) * Math.PI * 2;
          const startR = attract ? 150 + gravityMul * 20 : 20;
          let x = well.x + Math.cos(ang) * startR;
          let y = well.y + Math.sin(ang) * startR;
          g.moveTo(x, y);
          for (let step = 0; step < 18; step++) {
            const a = accel(x, y);
            const m = Math.hypot(a.ax, a.ay) || 1;
            x += (a.ax / m) * 14;
            y += (a.ay / m) * 14;
            g.lineTo(x, y);
          }
          g.stroke({ width: 1.4, color, alpha: 0.38 });
        }
        g.circle(well.x, well.y, 16);
        g.fill({ color, alpha: 0.22 });
        g.circle(well.x, well.y, 11);
        g.fill({ color, alpha: 0.95 });
      }

      if (pointerDown && dragWell == null) {
        g.circle(px, py, 18);
        g.stroke({ width: 2, color: 0xd8e4f0, alpha: 0.55 });
        g.circle(px, py, 4);
        g.fill({ color: 0xeef4fb, alpha: 0.9 });
      }

      for (const p of particles) {
        if (p.trail.length > 1) {
          g.moveTo(p.trail[0].x, p.trail[0].y);
          for (let i = 1; i < p.trail.length; i++) g.lineTo(p.trail[i].x, p.trail[i].y);
          g.stroke({ width: 1.4, color: 0x9eb4c8, alpha: 0.28 });
        }
        const spd = Math.min(1, Math.hypot(p.vx, p.vy) / 420);
        g.circle(p.x, p.y, 2.2 + spd * 1.6);
        g.fill({ color: 0xe4eef8, alpha: 0.5 + spd * 0.45 });
      }
    },
    resize(nw, nh) {
      const sx = nw / w;
      const sy = nh / h;
      w = nw;
      h = nh;
      for (const well of wells) {
        well.x *= sx;
        well.y *= sy;
      }
      for (const p of particles) {
        p.x *= sx;
        p.y *= sy;
        p.trail = [];
      }
    },
    destroy() {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("dblclick", onDbl);
      el.removeEventListener("pointerdown", onPointerDownTap);
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
  tagline: "Pull a swarm — your finger is a magnet, wells bend the field.",
  hint: "Drag wells, or touch empty space to attract. Double-tap to place another.",
  accent: "#7eb6c9",
  mount,
};
