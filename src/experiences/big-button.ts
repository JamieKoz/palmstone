import { Container, Graphics } from "pixi.js";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  let press = 0;
  let target = 0;
  let bloom = 0;
  let held = false;

  const radius = () => Math.min(w, h) * 0.3;

  const hit = (x: number, y: number) => {
    return Math.hypot(x - w * 0.5, y - h * 0.5) < radius() * 1.15;
  };

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    if (!hit(e.clientX, e.clientY)) return;
    held = true;
    target = 1;
    bloom = 1;
    audio.buttonPress("down", 0.95);
    haptics.pattern([0, 22, 40, 12]);
  };
  const onUp = () => {
    if (!held) return;
    held = false;
    target = 0;
    audio.buttonPress("up", 0.9);
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  return {
    update(dt: number) {
      const rate = target > press ? 20 : 13;
      press += (target - press) * Math.min(1, dt * rate);
      bloom = Math.max(0, bloom - dt * 1.6);

      const cx = w * 0.5;
      const cy = h * 0.5;
      const r = radius();
      // Scale toward center + slight sink — classic arcade mush
      const s = 1 - press * 0.18;
      const sink = press * r * 0.06;
      const br = r * s;
      const side = Math.max(3, r * 0.11 * (1 - press * 0.85));
      const topY = cy + sink;

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x121018, alpha: 1 });

      // Fixed housing
      g.circle(cx, cy, r * 1.22);
      g.fill({ color: 0x1a2220, alpha: 1 });
      g.circle(cx, cy, r * 1.22);
      g.stroke({ width: 3, color: 0x343e3a, alpha: 1 });

      // Recessed well
      g.circle(cx, cy, r * 1.04);
      g.fill({ color: 0x080a0c, alpha: 1 });

      // Button side wall (single band — thickness cue)
      g.circle(cx, topY + side * 0.65, br);
      g.fill({ color: 0x8a3830, alpha: 1 });

      // Button top face (scales)
      g.circle(cx, topY, br);
      g.fill({ color: press > 0.55 ? 0xb04e42 : 0xc45a4a, alpha: 1 });

      // Specular — compresses with scale
      g.circle(cx - br * 0.22, topY - br * 0.2, br * 0.42);
      g.fill({ color: 0xffffff, alpha: 0.2 * (1 - press * 0.5) });

      // Rim lip
      g.circle(cx, topY, br);
      g.stroke({ width: 2.5, color: 0xe07068, alpha: 0.5 + (1 - press) * 0.25 });

      // Inner groove
      g.circle(cx, topY, br * 0.7);
      g.stroke({ width: 2, color: 0x8a3028, alpha: 0.35 });

      // Pressed: darken rim into the well
      if (press > 0.08) {
        g.circle(cx, topY, br);
        g.stroke({ width: 5 + press * 10, color: 0x000000, alpha: press * 0.35 });
      }

      if (bloom > 0.02) {
        g.circle(cx, topY, br * (1.05 + (1 - bloom) * 0.2));
        g.fill({ color: 0xffa090, alpha: bloom * 0.1 });
      }
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    destroy() {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      layer.destroy({ children: true });
    },
  };
}

export const bigButton: ExperienceModule = {
  id: "big-button",
  name: "Big Button",
  modality: "Press",
  tagline: "One giant round press — deep thunk, soft rebound.",
  hint: "Press the big red button.",
  accent: "#c45a4a",
  mount,
};
