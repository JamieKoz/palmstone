import { Container, Graphics } from "pixi.js";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Pad = {
  x: number;
  y: number;
  r: number;
  bloom: number;
  pitch: number;
};

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  const pads: Pad[] = [];
  function layout() {
    pads.length = 0;
    const pitches = [196, 220, 247, 262, 294, 330, 349, 392];
    const cols = 4;
    const rows = 2;
    const gapX = w / (cols + 1);
    const gapY = h / (rows + 1.2);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        pads.push({
          x: gapX * (c + 1),
          y: gapY * (r + 1.1),
          r: Math.min(gapX, gapY) * 0.32,
          bloom: 0,
          pitch: pitches[i++ % pitches.length],
        });
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
    audio.pulse(0.45);
    audio.tone(pad.pitch, 0.45, 0.28);
    haptics.pattern([0, 18]);
  };

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    const i = hit(e.clientX, e.clientY);
    if (i != null) strike(i);
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  el.style.touchAction = "none";

  // gentle idle pulse ring
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
        const breath = 0.5 + Math.sin(time * 1.4 + pad.pitch * 0.01) * 0.05;
        const r = pad.r * (1 + pad.bloom * 0.25);
        g.circle(pad.x, pad.y, r * 1.35);
        g.fill({ color: 0x3d5c4a, alpha: 0.15 + pad.bloom * 0.35 });
        g.circle(pad.x, pad.y, r);
        g.fill({ color: 0x2a3830, alpha: 0.95 });
        g.circle(pad.x, pad.y, r);
        g.stroke({
          width: 2.5,
          color: 0x8fbc8f,
          alpha: (0.35 + pad.bloom * 0.55) * breath,
        });
        if (pad.bloom > 0.05) {
          g.circle(pad.x, pad.y, r * (1.2 + (1 - pad.bloom)));
          g.stroke({ width: 2, color: 0xc5e1a5, alpha: pad.bloom * 0.6 });
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
  name: "Pulse Pads",
  modality: "Rhythm",
  tagline: "Tap pads — visual bloom and optional vibe.",
  hint: "Tap any pad. Sound and haptics follow.",
  accent: "#8fbc8f",
  mount,
};
