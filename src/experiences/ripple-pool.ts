import { BlurFilter, Container, Graphics } from "pixi.js";
import { rgb } from "@/engine/color";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Ripple = { x: number; y: number; t: number; amp: number };

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const fieldLayer = new Container();
  const ringLayer = new Graphics();
  layer.addChild(fieldLayer);
  layer.addChild(ringLayer);
  const g = new Graphics();
  fieldLayer.addChild(g);

  // Soft blur hides the sample lattice so waves read as continuous water.
  const blur = new BlurFilter({ strength: 6, quality: 3 });
  fieldLayer.filters = [blur];

  const ripples: Ripple[] = [];
  let pointerDown = false;
  let px = 0;
  let py = 0;
  let drip = 0;
  let time = 0;

  const spawn = (x: number, y: number, amp = 1) => {
    ripples.push({ x, y, t: 0, amp });
    if (ripples.length > 14) ripples.shift();
  };

  const onDown = (e: PointerEvent) => {
    pointerDown = true;
    px = e.clientX;
    py = e.clientY;
    void audio.resume();
    spawn(px, py, 1.2);
    audio.tone(180 + Math.random() * 40, 0.35, 0.35);
    haptics.tap(14);
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

  // Dense enough for soft water, cheap enough for mobile.
  const COLS = 42;
  const ROWS = 28;

  function sampleHeight(x: number, y: number): number {
    let hgt = 0;
    for (const rip of ripples) {
      const d = Math.hypot(x - rip.x, y - rip.y);
      const wave = Math.sin(d * 0.042 - rip.t * 4.0) * Math.exp(-rip.t * 0.65) * rip.amp;
      const envelope = Math.exp(-Math.max(0, d - rip.t * 190) * 0.0075);
      hgt += wave * envelope;
    }
    hgt += Math.sin(x * 0.009 + time * 0.55) * Math.cos(y * 0.011 - time * 0.38) * 0.07;
    return hgt;
  }

  return {
    update(dt: number) {
      time += dt;
      if (pointerDown) {
        drip += dt;
        if (drip > 0.14) {
          spawn(px + (Math.random() - 0.5) * 6, py + (Math.random() - 0.5) * 6, 0.5);
          audio.tone(160 + Math.random() * 80, 0.12, 0.18);
          drip = 0;
        }
      }

      for (const r of ripples) r.t += dt;
      for (let i = ripples.length - 1; i >= 0; i--) {
        if (ripples[i].t > 3.4) ripples.splice(i, 1);
      }

      const cw = w / COLS;
      const ch = h / ROWS;
      const cellR = Math.max(cw, ch) * 0.85;

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x0a1820, alpha: 1 });

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const x = (c + 0.5) * cw;
          const y = (r + 0.5) * ch;
          const hgt = sampleHeight(x, y);
          // Clamp shade so RGB never goes negative (Pixi color crash).
          const shade = Math.max(0, Math.min(1.4, 0.42 + hgt * 0.55));
          const blue = 70 + shade * 130;
          const green = 55 + shade * 95;
          const red = 12 + shade * 28;
          const color = rgb(red, green, blue);
          g.circle(x, y, cellR);
          g.fill({ color, alpha: 0.55 + Math.min(0.4, Math.abs(hgt) * 0.35) });
        }
      }

      ringLayer.clear();
      for (const rip of ripples) {
        for (let k = 0; k < 3; k++) {
          const radius = rip.t * 150 + k * 22;
          const alpha = Math.max(0, 0.28 * Math.exp(-rip.t * 0.85 - k * 0.35) * rip.amp);
          if (alpha < 0.02) continue;
          ringLayer.circle(rip.x, rip.y, radius);
          ringLayer.stroke({ width: 1.5 + (1 - k * 0.25), color: 0xc5e8f5, alpha });
        }
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
      fieldLayer.filters = null;
      blur.destroy();
      layer.destroy({ children: true });
    },
  };
}

export const ripplePool: ExperienceModule = {
  id: "ripple-pool",
  name: "Ripple Pool",
  modality: "Fluid",
  tagline: "Touch ripples — overlapping waves that interfere.",
  hint: "Tap or hold to send ripples.",
  accent: "#6a9fb5",
  mount,
};
