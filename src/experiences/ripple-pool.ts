import { Container, Graphics } from "pixi.js";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Ripple = { x: number; y: number; t: number; amp: number };

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  const ripples: Ripple[] = [];
  let pointerDown = false;
  let px = 0;
  let py = 0;
  let drip = 0;
  let time = 0;

  const spawn = (x: number, y: number, amp = 1) => {
    ripples.push({ x, y, t: 0, amp });
    if (ripples.length > 18) ripples.shift();
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

  const COLS = 36;
  const ROWS = 24;

  return {
    update(dt: number) {
      time += dt;
      if (pointerDown) {
        drip += dt;
        if (drip > 0.12) {
          spawn(px + (Math.random() - 0.5) * 8, py + (Math.random() - 0.5) * 8, 0.55);
          audio.tone(160 + Math.random() * 80, 0.15, 0.2);
          drip = 0;
        }
      }

      for (const r of ripples) r.t += dt;
      for (let i = ripples.length - 1; i >= 0; i--) {
        if (ripples[i].t > 3.2) ripples.splice(i, 1);
      }

      const cw = w / COLS;
      const ch = h / ROWS;

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x0b1a22, alpha: 1 });

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const x = (c + 0.5) * cw;
          const y = (r + 0.5) * ch;
          let hgt = 0;
          for (const rip of ripples) {
            const d = Math.hypot(x - rip.x, y - rip.y);
            const wave = Math.sin(d * 0.045 - rip.t * 4.2) * Math.exp(-rip.t * 0.7) * rip.amp;
            const envelope = Math.exp(-Math.max(0, d - rip.t * 180) * 0.008);
            hgt += wave * envelope;
          }
          // ambient breath
          hgt += Math.sin(x * 0.01 + time * 0.6) * Math.cos(y * 0.012 - time * 0.4) * 0.08;

          const shade = 0.35 + hgt * 0.45;
          const blue = Math.floor(Math.min(255, 90 + shade * 110));
          const green = Math.floor(Math.min(255, 70 + shade * 90));
          const color = (20 << 16) | (green << 8) | blue;
          g.roundRect(c * cw, r * ch, cw + 1, ch + 1, 2);
          g.fill({ color, alpha: 0.85 });
        }
      }

      for (const rip of ripples) {
        const radius = rip.t * 160;
        const alpha = Math.max(0, 0.35 * Math.exp(-rip.t * 0.9) * rip.amp);
        g.circle(rip.x, rip.y, radius);
        g.stroke({ width: 2, color: 0xb8e0f0, alpha });
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

export const ripplePool: ExperienceModule = {
  id: "ripple-pool",
  name: "Ripple Pool",
  modality: "Fluid",
  tagline: "Touch ripples — overlapping waves that interfere.",
  hint: "Tap or hold to send ripples.",
  accent: "#6a9fb5",
  mount,
};
