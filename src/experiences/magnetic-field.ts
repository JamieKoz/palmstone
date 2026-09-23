import { Container, Graphics } from "pixi.js";
import { createHud } from "@/engine/hud";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Particle = { x: number; y: number; vx: number; vy: number };
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
  /** Gravity / field strength multiplier */
  let gravityMul = 1;
  hud.slider("Gravity", 0.35, 2.4, gravityMul, (v) => {
    gravityMul = v;
  });

  const particles: Particle[] = Array.from({ length: 90 }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: 0,
    vy: 0,
  }));

  const wells: Well[] = [
    { x: w * 0.3, y: h * 0.4, strength: 1 },
    { x: w * 0.7, y: h * 0.55, strength: -0.85 },
  ];

  let dragWell: number | null = null;
  let px = 0;
  let py = 0;
  let flickAcc = 0;

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

  return {
    update(dt: number) {
      if (dragWell != null) {
        wells[dragWell].x = px;
        wells[dragWell].y = py;
      }

      const gScale = gravityMul;
      let energy = 0;
      for (const p of particles) {
        let ax = 0;
        let ay = 0;
        for (const well of wells) {
          const dx = well.x - p.x;
          const dy = well.y - p.y;
          const d2 = dx * dx + dy * dy + 80;
          const d = Math.sqrt(d2);
          const f = (well.strength * 22000 * gScale) / d2;
          ax += (dx / d) * f;
          ay += (dy / d) * f;
          ax += (-dy / d) * well.strength * 8 * gScale;
          ay += (dx / d) * well.strength * 8 * gScale;
        }
        p.vx = (p.vx + ax * dt) * 0.985;
        p.vy = (p.vy + ay * dt) * 0.985;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < 0) p.x += w;
        if (p.x > w) p.x -= w;
        if (p.y < 0) p.y += h;
        if (p.y > h) p.y -= h;
        energy += Math.hypot(p.vx, p.vy);
      }

      flickAcc += energy * dt * 0.001;
      if (flickAcc > 8) {
        audio.grain(0.12, 1.4);
        flickAcc = 0;
      }

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x10141c, alpha: 1 });

      for (const well of wells) {
        const attract = well.strength > 0;
        const color = attract ? 0x7eb6c9 : 0xc97e6a;
        const reach = 14 + gravityMul * 8;
        for (let i = 3; i >= 1; i--) {
          g.circle(well.x, well.y, reach * i);
          g.stroke({ width: 1.5, color, alpha: 0.1 * (4 - i) * (0.7 + gravityMul * 0.2) });
        }
        g.circle(well.x, well.y, 10);
        g.fill({ color, alpha: 0.85 });
      }

      for (const p of particles) {
        const spd = Math.min(1, Math.hypot(p.vx, p.vy) / 400);
        g.circle(p.x, p.y, 2.4 + spd);
        g.fill({ color: 0xd8e4f0, alpha: 0.55 + spd * 0.4 });
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
  name: "Magnetic Field",
  modality: "Force",
  tagline: "Drag attract and repel wells through a field of particles.",
  hint: "Drag wells. Gravity slider scales the field. Double-tap to place another.",
  accent: "#7eb6c9",
  mount,
};
