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

  let angle = 0;
  let omega = 0;
  let dragging = false;
  let lastA = 0;
  let lastT = 0;
  let clickPhase = 0;
  let held = false;

  const radius = () => Math.min(w, h) * 0.28;

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    const cx = w * 0.5;
    const cy = h * 0.5;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    if (Math.hypot(dx, dy) > radius() * 1.35) return;
    dragging = true;
    held = true;
    lastA = Math.atan2(dy, dx);
    lastT = performance.now();
    omega *= 0.3;
    haptics.tap(6);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const a = Math.atan2(e.clientY - cy, e.clientX - cx);
    let da = a - lastA;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    const now = performance.now();
    const dt = Math.max(0.008, (now - lastT) / 1000);
    omega = da / dt;
    angle += da;
    lastA = a;
    lastT = now;
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    held = false;
    // Flick boost
    if (Math.abs(omega) > 2) {
      audio.whoosh(Math.min(1, Math.abs(omega) / 25));
      haptics.pattern([0, 10]);
    }
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  return {
    update(dt: number) {
      if (!held) {
        // Friction
        omega *= Math.exp(-dt * 0.55);
        if (Math.abs(omega) < 0.15) omega = 0;
        angle += omega * dt;
      }

      clickPhase += Math.abs(omega) * dt;
      if (clickPhase > 0.55) {
        clickPhase = 0;
        if (Math.abs(omega) > 1.5) {
          audio.click(0.18, 1.4 + Math.min(0.4, Math.abs(omega) * 0.02));
        }
      }

      const cx = w * 0.5;
      const cy = h * 0.5;
      const r = radius();

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x101418, alpha: 1 });

      // Soft motion blur ring
      if (Math.abs(omega) > 4) {
        g.circle(cx, cy, r * 1.05);
        g.stroke({ width: 10, color: 0x6a8aaa, alpha: Math.min(0.35, Math.abs(omega) * 0.015) });
      }

      // Bearing hub
      g.circle(cx, cy, r * 0.22);
      g.fill({ color: 0x3a4450, alpha: 1 });
      g.circle(cx, cy, r * 0.12);
      g.fill({ color: 0x1a2028, alpha: 1 });
      g.circle(cx, cy, r * 0.05);
      g.fill({ color: 0xc0c8d0, alpha: 0.8 });

      // Three arms + weights
      for (let i = 0; i < 3; i++) {
        const a = angle + (i * Math.PI * 2) / 3;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const x0 = cx + cos * r * 0.2;
        const y0 = cy + sin * r * 0.2;
        const x1 = cx + cos * r * 0.72;
        const y1 = cy + sin * r * 0.72;

        g.moveTo(x0 + sin * 8, y0 - cos * 8);
        g.lineTo(x1 + sin * 10, y1 - cos * 10);
        g.lineTo(x1 - sin * 10, y1 + cos * 10);
        g.lineTo(x0 - sin * 8, y0 + cos * 8);
        g.closePath();
        g.fill({ color: 0x5a7a9a, alpha: 0.95 });

        g.circle(x1, y1, r * 0.28);
        g.fill({ color: 0x7a9aba, alpha: 1 });
        g.circle(x1 - cos * r * 0.08 - sin * r * 0.06, y1 - sin * r * 0.08 + cos * r * 0.06, r * 0.1);
        g.fill({ color: 0xffffff, alpha: 0.2 });
        g.circle(x1, y1, r * 0.1);
        g.fill({ color: 0x2a3440, alpha: 0.85 });
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

export const fidgetSpinner: ExperienceModule = {
  id: "fidget-spinner",
  collection: "field",
  name: "Fidget Spinner",
  modality: "Fidget",
  tagline: "Flick the arms — bearings hum, then coast to still.",
  hint: "Drag to spin. Flick hard for a long coast.",
  accent: "#7a9aba",
  mount,
};
