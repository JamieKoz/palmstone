import { Container, Graphics } from "pixi.js";
import { rgb } from "@/engine/color";
import { createHud } from "@/engine/hud";
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

  const host = ctx.app.canvas.parentElement ?? document.body;
  const hud = createHud(host);

  let continuousFall = false;
  let fallAcc = 0;

  const N = Math.min(1400, Math.floor((w * h) / 900));
  const grains: Grain[] = [];

  function makeGrain(x?: number, y?: number): Grain {
    return {
      x: x ?? Math.random() * w,
      y: y ?? h * 0.55 + Math.random() * h * 0.4,
      vx: (Math.random() - 0.5) * 20,
      vy: 0,
      r: 1.2 + Math.random() * 1.8,
      shade: 0.55 + Math.random() * 0.45,
    };
  }

  function resetGrains() {
    grains.length = 0;
    for (let i = 0; i < N; i++) grains.push(makeGrain());
  }
  resetGrains();

  hud.toggle("Pouring", "Pour", false, (on) => {
    continuousFall = on;
    void audio.resume();
    haptics.tap(8);
  });
  hud.button("Reset", () => {
    resetGrains();
    void audio.resume();
    audio.grain(0.4, 0.6);
    haptics.tap(12);
  });

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

      if (continuousFall) {
        fallAcc += dt;
        while (fallAcc > 0.012) {
          fallAcc -= 0.012;
          // Recycle lowest grains into a pour stream from the top
          let worst = 0;
          for (let i = 1; i < grains.length; i++) {
            if (grains[i].y > grains[worst].y) worst = i;
          }
          const g0 = grains[worst];
          g0.x = w * 0.35 + Math.random() * w * 0.3;
          g0.y = -4 - Math.random() * 20;
          g0.vx = (Math.random() - 0.5) * 40;
          g0.vy = 40 + Math.random() * 80;
        }
      }

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
        if (grain.y < grain.r && !continuousFall) {
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
      g.roundRect(0, h * 0.42, w, h * 0.58, 0);
      g.fill({ color: 0x2a241c, alpha: 1 });
      g.roundRect(8, h * 0.44, w - 16, h * 0.54, 18);
      g.fill({ color: 0x3a3228, alpha: 1 });

      for (const grain of grains) {
        const c = Math.floor(0xb0 * grain.shade + 0x40);
        g.circle(grain.x, grain.y, grain.r);
        g.fill({ color: rgb(c, c * 0.85, c * 0.55), alpha: 0.95 });
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
      hud.destroy();
      layer.destroy({ children: true });
    },
  };
}

export const sandTray: ExperienceModule = {
  id: "sand-tray",
  name: "Sand Tray",
  modality: "Granular",
  tagline: "Pour, rake, pile — grain weight under the thumb.",
  hint: "Drag to rake. Use Pour for continuous fall, Reset to refill.",
  accent: "#c4a574",
  mount,
};
