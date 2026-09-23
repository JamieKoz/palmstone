import { Container, Graphics } from "pixi.js";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Slider = {
  trackY: number;
  trackX0: number;
  trackX1: number;
  value: number;
  target: number;
  snaps: number[];
  /** Phase offset so each row weaves differently */
  phase: number;
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
    const values = sliders.map((s) => s.value);
    const targets = sliders.map((s) => s.target);
    sliders.length = 0;
    const n = 6;
    const top = h * 0.18;
    const bottom = h * 0.85;
    for (let i = 0; i < n; i++) {
      const trackY = top + ((bottom - top) * i) / (n - 1);
      const snaps = [0, 0.25, 0.5, 0.75, 1];
      const value = values[i] ?? (i * 0.13) % 1;
      sliders.push({
        trackY,
        trackX0: w * 0.12,
        trackX1: w * 0.88,
        value,
        target: targets[i] ?? value,
        snaps,
        phase: i * 0.9,
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
        const diff = s.target - s.value;
        const resistance = 0.12 + Math.abs(diff) * 0.05;
        s.value += diff * Math.min(1, resistance * dt * 60);

        if (drag != null && sliders[drag] === s) {
          for (const snap of s.snaps) {
            const d = snap - s.value;
            if (Math.abs(d) < 0.06) s.value += d * 0.15;
          }
        }
      }

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x141816, alpha: 1 });

      // Stronger horizontal weave — angles visibly respond to sliders.
      const threads = 28;
      const amp = Math.min(w, h) * 0.14;
      for (let i = 0; i < threads; i++) {
        const t = i / (threads - 1);
        const x0 = w * 0.12 + t * w * 0.76;
        g.moveTo(x0, h * 0.1);
        for (let s = 0; s < sliders.length; s++) {
          const sl = sliders[s];
          // Alternating over/under bias + large slider-driven offset
          const weave =
            Math.sin(t * Math.PI * 3.2 + sl.phase) * (0.35 + sl.value * 0.9) +
            Math.sin(t * Math.PI * 7 + s * 0.4) * 0.15;
          const lean = (sl.value - 0.5) * 2; // -1..1
          const offset = weave * amp + lean * amp * 0.85;
          g.lineTo(x0 + offset, sl.trackY);
        }
        // Exit angle continues the last lean so threads don't snap vertical
        const last = sliders[sliders.length - 1];
        const exitLean = (last.value - 0.5) * amp * 1.1;
        g.lineTo(x0 + exitLean, h * 0.92);
        g.stroke({
          width: 1.6,
          color: 0x6a8f7a,
          alpha: 0.28 + (i % 3 === 0 ? 0.22 : 0),
        });
      }

      for (let i = 0; i < sliders.length; i++) {
        const s = sliders[i];
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
  hint: "Slide each bar. Watch the weave angles shift.",
  accent: "#8fa894",
  mount,
};
