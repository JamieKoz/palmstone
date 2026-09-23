import { Container, Graphics } from "pixi.js";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Grain = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  shade: number;
};

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  const N = Math.min(1400, Math.floor((w * h) / 900));
  const grains: Grain[] = [];
  for (let i = 0; i < N; i++) {
    grains.push({
      x: Math.random() * w,
      y: h * 0.55 + Math.random() * h * 0.4,
      vx: 0,
      vy: 0,
      r: 1.2 + Math.random() * 1.8,
      shade: 0.55 + Math.random() * 0.45,
    });
  }

  let pointerDown = false;
  let px = 0;
  let py = 0;
  let pvx = 0;
  let pvy = 0;
  let lastPx = 0;
  let lastPy = 0;
  let scrapeAcc = 0;

  const onDown = (e: PointerEvent) => {
    pointerDown = true;
    px = e.clientX;
    py = e.clientY;
    lastPx = px;
    lastPy = py;
    void audio.resume();
    haptics.tap(8);
  };
  const onMove = (e: PointerEvent) => {
    px = e.clientX;
    py = e.clientY;
  };
  const onUp = () => {
    pointerDown = false;
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  return {
    update(dt: number) {
      const damp = Math.pow(0.92, dt * 60);
      pvx = (px - lastPx) / Math.max(dt, 0.001);
      pvy = (py - lastPy) / Math.max(dt, 0.001);
      lastPx = px;
      lastPy = py;

      const gravity = 420;
      const brushR = 56;
      let moved = 0;

      for (const grain of grains) {
        grain.vy += gravity * dt;
        if (pointerDown) {
          const dx = grain.x - px;
          const dy = grain.y - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < brushR * brushR) {
            const d = Math.sqrt(d2) || 1;
            const push = (1 - d / brushR) * 2.4;
            grain.vx += (pvx * 0.15 + (dx / d) * 80) * push * dt * 60;
            grain.vy += (pvy * 0.15 + (dy / d) * 40 - 30) * push * dt * 60;
            moved += push;
          }
        }

        grain.vx *= damp;
        grain.vy *= damp;
        grain.x += grain.vx * dt;
        grain.y += grain.vy * dt;

        if (grain.x < grain.r) {
          grain.x = grain.r;
          grain.vx *= -0.35;
        } else if (grain.x > w - grain.r) {
          grain.x = w - grain.r;
          grain.vx *= -0.35;
        }
        if (grain.y > h - grain.r) {
          grain.y = h - grain.r;
          grain.vy *= -0.22;
          grain.vx *= 0.85;
        }
        if (grain.y < grain.r) {
          grain.y = grain.r;
          grain.vy *= -0.3;
        }
      }

      scrapeAcc += moved * dt;
      if (pointerDown && scrapeAcc > 0.35) {
        const speed = Math.min(1, Math.hypot(pvx, pvy) / 900);
        audio.grain(0.25 + speed * 0.55, 0.7 + speed * 0.5);
        if (speed > 0.25) haptics.tap(6);
        scrapeAcc = 0;
      }

      g.clear();
      // tray bed
      g.roundRect(0, h * 0.42, w, h * 0.58, 0);
      g.fill({ color: 0x2a241c, alpha: 1 });
      g.roundRect(8, h * 0.44, w - 16, h * 0.54, 18);
      g.fill({ color: 0x3a3228, alpha: 1 });

      for (const grain of grains) {
        const c = Math.floor(0xb0 * grain.shade + 0x40);
        const color = (c << 16) | ((c * 0.85) << 8) | (c * 0.55);
        g.circle(grain.x, grain.y, grain.r);
        g.fill({ color, alpha: 0.95 });
      }

      if (pointerDown) {
        g.circle(px, py, brushR);
        g.stroke({ width: 1.5, color: 0xd4c4a8, alpha: 0.25 });
      }
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    destroy() {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      layer.destroy({ children: true });
    },
  };
}

export const sandTray: ExperienceModule = {
  id: "sand-tray",
  name: "Sand Tray",
  modality: "Granular",
  tagline: "Pour, rake, pile — grain weight under the thumb.",
  hint: "Drag to rake. Flick to scatter.",
  accent: "#c4a574",
  mount,
};
