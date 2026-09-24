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

  let on = false;
  let lever = 0; // 0 = off (down), 1 = on (up)
  let target = 0;
  let bloom = 0;
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;

  const plate = () => {
    const size = Math.min(w, h) * 0.42;
    return {
      cx: w * 0.5,
      cy: h * 0.48,
      pw: size * 0.55,
      ph: size,
    };
  };

  const hit = (x: number, y: number) => {
    const p = plate();
    return Math.abs(x - p.cx) < p.pw * 0.55 && Math.abs(y - p.cy) < p.ph * 0.55;
  };

  const toggle = (force?: boolean) => {
    const next = force ?? !on;
    if (next === on) {
      target = on ? 1 : 0;
      return;
    }
    on = next;
    target = on ? 1 : 0;
    bloom = 1;
    audio.switchClick(on, 0.9);
    haptics.pattern([0, 18]);
  };

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    if (!hit(e.clientX, e.clientY)) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) moved = true;
    if (!moved) return;
    const p = plate();
    const t = 1 - (e.clientY - (p.cy - p.ph * 0.22)) / (p.ph * 0.44);
    target = Math.max(0, Math.min(1, t));
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    if (!moved) {
      // Tap — flip state
      toggle();
      return;
    }
    // Drag — snap to nearest end
    toggle(target > 0.5);
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  return {
    update(dt: number) {
      lever += (target - lever) * Math.min(1, dt * 18);
      bloom = Math.max(0, bloom - dt * 1.6);

      const light = 0.08 + lever * 0.72;
      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x0c0e12, alpha: 1 });

      // Room wash when on
      if (lever > 0.02) {
        g.circle(w * 0.5, h * 0.2, Math.max(w, h) * 0.7);
        g.fill({ color: 0xf5e6c8, alpha: light * 0.22 });
      }

      const p = plate();
      // Wall plate
      g.roundRect(p.cx - p.pw * 0.5, p.cy - p.ph * 0.5, p.pw, p.ph, 10);
      g.fill({ color: 0xe8e2d6, alpha: 0.95 });
      g.roundRect(p.cx - p.pw * 0.5, p.cy - p.ph * 0.5, p.pw, p.ph, 10);
      g.stroke({ width: 2, color: 0xc8c0b0, alpha: 0.8 });

      // Screw dots
      for (const sy of [-0.38, 0.38]) {
        g.circle(p.cx, p.cy + p.ph * sy, 3.5);
        g.fill({ color: 0xb0a890, alpha: 0.9 });
      }

      // Lever slot
      const slotH = p.ph * 0.42;
      g.roundRect(p.cx - p.pw * 0.16, p.cy - slotH * 0.5, p.pw * 0.32, slotH, 6);
      g.fill({ color: 0x2a2a28, alpha: 0.9 });

      // Lever paddle
      const ly = p.cy + (0.5 - lever) * slotH * 0.72;
      const lh = p.ph * 0.28;
      g.roundRect(p.cx - p.pw * 0.2, ly - lh * 0.5, p.pw * 0.4, lh, 5);
      g.fill({ color: 0xf4f0e6, alpha: 1 });
      g.roundRect(p.cx - p.pw * 0.2, ly - lh * 0.5, p.pw * 0.4, lh * 0.45, 5);
      g.fill({ color: 0xffffff, alpha: 0.35 });

      if (bloom > 0.05) {
        g.circle(p.cx, ly, p.pw * (0.55 + (1 - bloom) * 0.3));
        g.stroke({ width: 2, color: on ? 0xf0d090 : 0x90a0b0, alpha: bloom * 0.55 });
      }

      // Status glow bulb
      g.circle(p.cx, p.cy - p.ph * 0.55 - 18, 8 + lever * 4);
      g.fill({ color: 0xffe6a0, alpha: 0.15 + lever * 0.75 });
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

export const lightSwitch: ExperienceModule = {
  id: "light-switch",
  name: "Light Switch",
  modality: "Toggle",
  tagline: "Flip the paddle — room light answers the clack.",
  hint: "Tap or drag the switch up and down.",
  accent: "#e8d9a8",
  mount,
};
