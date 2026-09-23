import { Container, Graphics } from "pixi.js";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Slider = {
  x: number;
  trackY: number;
  trackX0: number;
  trackX1: number;
  value: number; // 0–1
  target: number;
  snaps: number[];
};

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  const sliders: Slider[] = [];

  function layout() {
    sliders.length = 0;
    const n = 6;
    const top = h * 0.18;
    const bottom = h * 0.85;
    for (let i = 0; i < n; i++) {
      const trackY = top + ((bottom - top) * i) / (n - 1);
      const snaps = [0, 0.25, 0.5, 0.75, 1];
      const value = (i * 0.13) % 1;
      sliders.push({
        x: 0,
        trackY,
        trackX0: w * 0.12,
        trackX1: w * 0.88,
        value,
        target: value,
        snaps,
      });
    }
  }
  layout();

  let drag: number | null = null;

  const hit = (x: number, y: number) => {
    for (let i = 0; i < sliders.length; i++) {
      const s = sliders[i];
      const sx = s.trackX0 + s.value * (s.trackX1 - s.trackX0);
      if (Math.hypot(sx - x, s.trackY - y) < 28) return i;
    }
    // also allow grabbing track
    for (let i = 0; i < sliders.length; i++) {
      const s = sliders[i];
      if (Math.abs(y - s.trackY) < 18 && x >= s.trackX0 - 10 && x <= s.trackX1 + 10) return i;
    }
    return null;
  };

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    drag = hit(e.clientX, e.clientY);
    if (drag != null) {
      haptics.tap(8);
      audio.click(0.2, 0.85);
    }
  };
  const onMove = (e: PointerEvent) => {
    if (drag == null) return;
    const s = sliders[drag];
    const t = (e.clientX - s.trackX0) / (s.trackX1 - s.trackX0);
    s.target = Math.max(0, Math.min(1, t));
  };
  const onUp = () => {
    if (drag != null) {
      const s = sliders[drag];
      // snap to nearest
      let best = s.snaps[0];
      let bestD = Infinity;
      for (const snap of s.snaps) {
        const d = Math.abs(s.value - snap);
        if (d < bestD) {
          bestD = d;
          best = snap;
        }
      }
      if (bestD < 0.08) {
        s.target = best;
        audio.click(0.35, 1 + best);
        haptics.tap(12);
      }
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
      for (const s of sliders) {
        // soft resistance toward target
        const diff = s.target - s.value;
        const resistance = 0.12 + Math.abs(diff) * 0.05;
        s.value += diff * Math.min(1, resistance * dt * 60);

        // magnetic pull near snaps while dragging
        if (drag != null && sliders[drag] === s) {
          for (const snap of s.snaps) {
            const d = snap - s.value;
            if (Math.abs(d) < 0.06) {
              s.value += d * 0.15;
            }
          }
        }
      }

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x141816, alpha: 1 });

      // loom threads — vertical weave based on slider values
      const threads = 24;
      for (let i = 0; i < threads; i++) {
        const t = i / (threads - 1);
        const x = w * 0.12 + t * w * 0.76;
        g.moveTo(x, h * 0.12);
        for (let s = 0; s < sliders.length; s++) {
          const sl = sliders[s];
          const offset = (Math.sin(t * Math.PI * 4 + s) * 0.5 + (sl.value - 0.5)) * 18;
          const x2 = x + offset;
          g.lineTo(x2, sl.trackY);
        }
        g.lineTo(x, h * 0.9);
        g.stroke({
          width: 1.5,
          color: 0x6a8f7a,
          alpha: 0.25 + (i % 3 === 0 ? 0.2 : 0),
        });
      }

      for (let i = 0; i < sliders.length; i++) {
        const s = sliders[i];
        // track
        g.moveTo(s.trackX0, s.trackY);
        g.lineTo(s.trackX1, s.trackY);
        g.stroke({ width: 4, color: 0x2a332e, alpha: 1 });
        g.moveTo(s.trackX0, s.trackY);
        g.lineTo(s.trackX1, s.trackY);
        g.stroke({ width: 1.5, color: 0x6d7f72, alpha: 0.7 });

        for (const snap of s.snaps) {
          const sx = s.trackX0 + snap * (s.trackX1 - s.trackX0);
          g.circle(sx, s.trackY, 3);
          g.fill({ color: 0x8fa894, alpha: 0.7 });
        }

        const hx = s.trackX0 + s.value * (s.trackX1 - s.trackX0);
        const active = drag === i;
        g.roundRect(hx - 14, s.trackY - 12, 28, 24, 8);
        g.fill({ color: active ? 0xd4c4a0 : 0xb8a888, alpha: 1 });
        g.roundRect(hx - 14, s.trackY - 12, 28, 24, 8);
        g.stroke({ width: 1.5, color: 0xefe4c8, alpha: 0.5 });
      }
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
      layout();
    },
    destroy() {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      layer.destroy({ children: true });
    },
  };
}

export const sliderLoom: ExperienceModule = {
  id: "slider-loom",
  name: "Slider Loom",
  modality: "Mechanical",
  tagline: "Multi-slider weave — snap points and soft resistance.",
  hint: "Slide each bar. Feel the snap points.",
  accent: "#8fa894",
  mount,
};
