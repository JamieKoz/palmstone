import { Container, Graphics } from "pixi.js";
import { hslToRgb } from "@/engine/color";
import { createHud } from "@/engine/hud";
import { gravityFromFeel } from "@/engine/storage";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Bead = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hue: number;
  orbiting: boolean;
  trail: { x: number; y: number }[];
};

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
  /** 0.4 – 2.2 gravity multiplier */
  let gravityMul = gravityFromFeel();

  hud.slider("Gravity", 0.35, 2.2, gravityMul, (v) => {
    gravityMul = v;
  });

  const wells = [
    { x: 0, y: 0, base: 0, strength: 0.78 },
    { x: 0, y: 0, base: 0, strength: 1 },
  ];

  /** Catch-ring size follows the slider so the field changes immediately. */
  const reachOf = (base: number) => base * (0.38 + gravityMul * 0.72);

  function placeWells() {
    const span = Math.min(w, h);
    wells[0].x = w * 0.35;
    wells[0].y = h * 0.48;
    wells[0].base = span * 0.168;
    wells[1].x = w * 0.68;
    wells[1].y = h * 0.52;
    wells[1].base = span * 0.145;
  }
  placeWells();

  const beads: Bead[] = Array.from({ length: 28 }, (_, i) => ({
    x: w * 0.08 + Math.random() * w * 0.84,
    y: h * 0.1 + Math.random() * h * 0.75,
    vx: (Math.random() - 0.5) * 36,
    vy: (Math.random() - 0.5) * 36,
    r: 7 + (i % 4),
    hue: (i * 0.07) % 1,
    orbiting: false,
    trail: [],
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

  return {
    update(dt: number) {
      if (drag != null) {
        beads[drag].x = px;
        beads[drag].y = py;
        beads[drag].vx = 0;
        beads[drag].vy = 0;
      }

      const gScale = gravityMul;
      for (let i = 0; i < beads.length; i++) {
        if (i === drag) continue;
        const b = beads[i];
        let nearest: { d: number; x: number; y: number; r: number; strength: number } | null = null;
        for (const well of wells) {
          const reach = reachOf(well.base);
          const dx = well.x - b.x;
          const dy = well.y - b.y;
          const d = Math.hypot(dx, dy) || 1;
          const pull = (720 * gScale * well.strength) / (d + 90);
          b.vx += (dx / d) * pull * dt;
          b.vy += (dy / d) * pull * dt;
          if (!nearest || d < nearest.d) {
            nearest = { d, x: well.x, y: well.y, r: reach, strength: well.strength };
          }
        }
        if (nearest && nearest.d < nearest.r * 1.35) {
          const dx = nearest.x - b.x;
          const dy = nearest.y - b.y;
          const d = nearest.d;
          const reach = nearest.r;
          const ring = Math.exp(-((d - reach) ** 2) / (reach * reach * 0.18));
          const tangent = 180 * gScale * nearest.strength * ring;
          b.vx += (-dy / d) * tangent * dt;
          b.vy += (dx / d) * tangent * dt;
          const towardRing = (d - reach) * 28 * nearest.strength;
          b.vx += (dx / d) * towardRing * dt;
          b.vy += (dy / d) * towardRing * dt;
          const radial = (dx * b.vx + dy * b.vy) / d;
          if (ring > 0.4) {
            b.vx -= (dx / d) * radial * 0.05;
            b.vy -= (dy / d) * radial * 0.05;
          }
        }
        b.vx *= Math.pow(0.998, dt * 60);
        b.vy *= Math.pow(0.998, dt * 60);
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
        const wasOrbit = b.orbiting;
        if (nearest) {
          const dx = b.x - nearest.x;
          const dy = b.y - nearest.y;
          const dNow = Math.hypot(dx, dy) || 1;
          const radial = (dx * b.vx + dy * b.vy) / dNow;
          const speed = Math.hypot(b.vx, b.vy);
          b.orbiting =
            dNow > nearest.r * 0.55 &&
            dNow < nearest.r * 1.35 &&
            Math.abs(radial) < 55 &&
            speed > 70;
          if (b.orbiting && !wasOrbit) {
            audio.tone(480 + b.hue * 220, 0.22, 0.08);
            haptics.tap(7);
          }
        } else {
          b.orbiting = false;
        }
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 8) b.trail.shift();
      }

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
        const reach = reachOf(well.base);
        const glow = 0.22 + gravityMul * 0.18;
        g.circle(well.x, well.y, reach * (1.08 + gravityMul * 0.08));
        g.fill({ color: 0x243655, alpha: 0.16 + gravityMul * 0.08 });
        g.circle(well.x, well.y, reach);
        g.fill({ color: 0x1a2740, alpha: 0.28 + gravityMul * 0.1 });
        g.circle(well.x, well.y, reach);
        g.stroke({ width: 1.5 + gravityMul * 1.6, color: 0x9ec0ee, alpha: 0.28 + glow });
        g.circle(well.x, well.y, reach * 0.62);
        g.stroke({ width: 1 + gravityMul * 0.6, color: 0x8aa4c8, alpha: 0.16 + gravityMul * 0.12 });
        g.circle(well.x, well.y, 3 + gravityMul * 4.5);
        g.fill({ color: 0xd5e4f8, alpha: 0.45 + gravityMul * 0.22 });
      }

      for (const b of beads) {
        if (b.trail.length > 1) {
          g.moveTo(b.trail[0].x, b.trail[0].y);
          for (let i = 1; i < b.trail.length; i++) g.lineTo(b.trail[i].x, b.trail[i].y);
          g.stroke({ width: 2, color: hslToRgb(b.hue, 0.4, 0.7), alpha: b.orbiting ? 0.55 : 0.22 });
        }
        g.circle(b.x, b.y, b.r);
        g.fill({ color: hslToRgb(b.hue, b.orbiting ? 0.55 : 0.35, 0.62), alpha: 0.95 });
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
        b.trail = [];
      }
    },
    destroy() {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      hud.destroy();
      layer.destroy({ children: true });
    },
  };
}

export const orbitBeads: ExperienceModule = {
  id: "orbit-beads",
  collection: "studio",
  name: "Orbit Beads",
  modality: "Spatial",
  tagline: "Fling beads into a ring — they catch and keep orbiting.",
  hint: "Drag and fling a bead toward a ring. Gravity grows the rings and pulls harder.",
  accent: "#8aa4c8",
  mount,
};
