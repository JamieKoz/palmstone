import { Container, Graphics } from "pixi.js";
import { getSharedAudio } from "@/engine/audio";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Pad = {
  x: number;
  y: number;
  r: number;
  bloom: number;
  /** Fundamental membrane frequency */
  freq: number;
  /** Visual accent hue shift */
  tint: number;
};

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;
  const shared = getSharedAudio();

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  // Distinct bongo-ish fundamentals across the pad set
  const freqs = [98, 118, 140, 165, 185, 210, 245, 280];
  const tints = [0x6a8f7a, 0x7a9e6a, 0x8fbc6a, 0xa8c478, 0x6a9e8f, 0x5a8f9e, 0x8f8a6a, 0xb0a070];

  const pads: Pad[] = [];
  function layout() {
    pads.length = 0;
    // Narrow screens: stack 2×4 so pads stay thumb-sized
    const narrow = w < 560;
    const cols = narrow ? 2 : 4;
    const rows = narrow ? 4 : 2;
    const marginX = narrow ? w * 0.1 : w / (cols + 1);
    const marginY = narrow ? h * 0.12 : h / (rows + 1.2);
    const cellW = narrow ? (w - marginX * 2) / cols : w / (cols + 1);
    const cellH = narrow ? (h - marginY * 2) / rows : h / (rows + 1.2);
    const radius = Math.min(cellW, cellH) * (narrow ? 0.4 : 0.34);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        pads.push({
          x: narrow ? marginX + cellW * (c + 0.5) : cellW * (c + 1),
          y: narrow ? marginY + cellH * (r + 0.5) : cellH * (r + 1.1),
          r: radius,
          bloom: 0,
          freq: freqs[i],
          tint: tints[i],
        });
        i++;
      }
    }
  }
  layout();

  const hit = (x: number, y: number) => {
    for (let i = 0; i < pads.length; i++) {
      if (Math.hypot(pads[i].x - x, pads[i].y - y) < pads[i].r) return i;
    }
    return null;
  };

  const strike = (i: number) => {
    const pad = pads[i];
    pad.bloom = 1;
    shared.bongo(pad.freq, 0.75 + (i % 3) * 0.08);
    haptics.pattern([0, 14 + (i % 4) * 3]);
  };

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    void shared.unlockAndStartPeace();
    const i = hit(e.clientX, e.clientY);
    if (i != null) strike(i);
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  el.style.touchAction = "none";

  let time = 0;

  return {
    update(dt: number) {
      time += dt;
      for (const pad of pads) {
        pad.bloom = Math.max(0, pad.bloom - dt * 1.8);
      }

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x121018, alpha: 1 });

      for (const pad of pads) {
        const breath = 0.5 + Math.sin(time * 1.4 + pad.freq * 0.01) * 0.05;
        const r = pad.r * (1 + pad.bloom * 0.28);
        g.circle(pad.x, pad.y, r * 1.35);
        g.fill({ color: pad.tint, alpha: 0.12 + pad.bloom * 0.35 });
        g.circle(pad.x, pad.y, r);
        g.fill({ color: 0x2a3830, alpha: 0.95 });
        g.circle(pad.x, pad.y, r);
        g.stroke({
          width: 2.5,
          color: pad.tint,
          alpha: (0.4 + pad.bloom * 0.55) * breath,
        });
        if (pad.bloom > 0.05) {
          g.circle(pad.x, pad.y, r * (1.15 + (1 - pad.bloom) * 0.4));
          g.stroke({ width: 2, color: 0xc5e1a5, alpha: pad.bloom * 0.65 });
        }
      }
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
      layout();
    },
    destroy() {
      el.removeEventListener("pointerdown", onDown);
      layer.destroy({ children: true });
    },
  };
}

export const pulsePads: ExperienceModule = {
  id: "pulse-pads",
  collection: "field",
  name: "Pulse Pads",
  modality: "Rhythm",
  tagline: "Tap pads — each hits a distinct bongo tone.",
  hint: "Tap any pad. Each has its own bongo pitch.",
  accent: "#8fbc8f",
  mount,
};
