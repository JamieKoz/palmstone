import { Container, Graphics } from "pixi.js";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Bead = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hue: number;
};

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  const wells = [
    { x: 0, y: 0, r: 0 },
    { x: 0, y: 0, r: 0 },
  ];

  function placeWells() {
    wells[0].x = w * 0.35;
    wells[0].y = h * 0.48;
    wells[0].r = Math.min(w, h) * 0.22;
    wells[1].x = w * 0.68;
    wells[1].y = h * 0.52;
    wells[1].r = Math.min(w, h) * 0.16;
  }
  placeWells();

  const beads: Bead[] = Array.from({ length: 28 }, (_, i) => ({
    x: w * 0.2 + Math.random() * w * 0.6,
    y: h * 0.2 + Math.random() * h * 0.5,
    vx: 0,
    vy: 0,
    r: 7 + (i % 4),
    hue: (i * 0.07) % 1,
  }));

  let drag: number | null = null;
  let px = 0;
  let py = 0;
  let throwVx = 0;
  let throwVy = 0;
  let lastMoveT = 0;

  const hit = (x: number, y: number) => {
    for (let i = beads.length - 1; i >= 0; i--) {
      if (Math.hypot(beads[i].x - x, beads[i].y - y) < beads[i].r + 14) return i;
    }
    return null;
  };

  const onDown = (e: PointerEvent) => {
    px = e.clientX;
    py = e.clientY;
    throwVx = 0;
    throwVy = 0;
    lastMoveT = performance.now();
    drag = hit(px, py);
    void audio.resume();
    if (drag != null) {
      haptics.tap(10);
      audio.click(0.25, 1.2);
    }
  };
  const onMove = (e: PointerEvent) => {
    const now = performance.now();
    const dt = Math.max(0.008, (now - lastMoveT) / 1000);
    throwVx = (e.clientX - px) / dt;
    throwVy = (e.clientY - py) / dt;
    lastMoveT = now;
    px = e.clientX;
    py = e.clientY;
  };
  const onUp = () => {
    if (drag != null) {
      const b = beads[drag];
      b.vx = throwVx * 0.55;
      b.vy = throwVy * 0.55;
      audio.whoosh(Math.min(0.7, Math.hypot(b.vx, b.vy) / 800));
      haptics.tap(8);
    }
    drag = null;
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  function hsl(h: number, s: number, l: number) {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h * 12) % 12;
      return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)));
    };
    return (f(0) << 16) | (f(8) << 8) | f(4);
  }

  return {
    update(dt: number) {
      if (drag != null) {
        beads[drag].x = px;
        beads[drag].y = py;
        beads[drag].vx = 0;
        beads[drag].vy = 0;
      }

      for (let i = 0; i < beads.length; i++) {
        if (i === drag) continue;
        const b = beads[i];
        // gravity wells
        for (const well of wells) {
          const dx = well.x - b.x;
          const dy = well.y - b.y;
          const d = Math.hypot(dx, dy) || 1;
          const pull = 900 / (d + 40);
          b.vx += (dx / d) * pull * dt;
          b.vy += (dy / d) * pull * dt;
          // orbital preference near well
          if (d < well.r * 1.6) {
            b.vx += (-dy / d) * 40 * dt;
            b.vy += (dx / d) * 40 * dt;
          }
        }
        b.vx *= Math.pow(0.995, dt * 60);
        b.vy *= Math.pow(0.995, dt * 60);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < b.r) {
          b.x = b.r;
          b.vx *= -0.6;
        }
        if (b.x > w - b.r) {
          b.x = w - b.r;
          b.vx *= -0.6;
        }
        if (b.y < b.r) {
          b.y = b.r;
          b.vy *= -0.6;
        }
        if (b.y > h - b.r) {
          b.y = h - b.r;
          b.vy *= -0.6;
        }
      }

      // soft collisions
      for (let i = 0; i < beads.length; i++) {
        for (let j = i + 1; j < beads.length; j++) {
          const a = beads[i];
          const b = beads[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 1;
          const min = a.r + b.r;
          if (dist < min) {
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = (min - dist) * 0.5;
            if (i !== drag) {
              a.x -= nx * overlap;
              a.y -= ny * overlap;
            }
            if (j !== drag) {
              b.x += nx * overlap;
              b.y += ny * overlap;
            }
            const dv = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
            if (dv > 0) {
              a.vx -= dv * nx * 0.5;
              a.vy -= dv * ny * 0.5;
              b.vx += dv * nx * 0.5;
              b.vy += dv * ny * 0.5;
              if (dv > 80) audio.click(0.15, 1.4);
            }
          }
        }
      }

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x0c1018, alpha: 1 });

      for (const well of wells) {
        g.circle(well.x, well.y, well.r);
        g.stroke({ width: 1.5, color: 0x4a6080, alpha: 0.35 });
        g.circle(well.x, well.y, 4);
        g.fill({ color: 0x8aa4c8, alpha: 0.5 });
      }

      for (const b of beads) {
        g.circle(b.x, b.y, b.r);
        g.fill({ color: hsl(b.hue, 0.35, 0.62), alpha: 0.95 });
        g.circle(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.28);
        g.fill({ color: 0xffffff, alpha: 0.35 });
      }
    },
    resize(nw, nh) {
      const sx = nw / w;
      const sy = nh / h;
      w = nw;
      h = nh;
      placeWells();
      for (const b of beads) {
        b.x *= sx;
        b.y *= sy;
      }
    },
    destroy() {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      layer.destroy({ children: true });
    },
  };
}

export const orbitBeads: ExperienceModule = {
  id: "orbit-beads",
  name: "Orbit Beads",
  modality: "Spatial",
  tagline: "Fling beads into stable orbits around gravity wells.",
  hint: "Drag and fling a bead. Watch orbits form.",
  accent: "#8aa4c8",
  mount,
};
