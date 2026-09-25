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
      if (bestD < 0.12) {
        s.target = best;
        audio.click(0.55, 0.9 + best * 0.35);
        audio.pulse(0.28);
        haptics.tap(16);
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
      const threads = 36;
      const amp = Math.min(w, h) * 0.2;
      for (let i = 0; i < threads; i++) {
        const t = i / (threads - 1);
        const x0 = w * 0.12 + t * w * 0.76;
        g.moveTo(x0, h * 0.08);
        for (let s = 0; s < sliders.length; s++) {
          const sl = sliders[s];
          const weave =
            Math.sin(t * Math.PI * 3.2 + sl.phase) * (0.45 + sl.value * 1.15) +
            Math.sin(t * Math.PI * 7 + s * 0.4) * 0.12;
          const lean = (sl.value - 0.5) * 2;
          const offset = weave * amp + lean * amp;
          g.lineTo(x0 + offset, sl.trackY);
        }
        const last = sliders[sliders.length - 1];
        const exitLean = (last.value - 0.5) * amp * 1.2;
        g.lineTo(x0 + exitLean, h * 0.94);
        g.stroke({
          width: i % 4 === 0 ? 3.4 : 2.2,
          color: i % 2 === 0 ? 0xc4b48a : 0x6a8f7a,
          alpha: 0.55,
        });
      }

      for (const s of sliders) {
        const bow = (s.value - 0.5) * 18;
        g.moveTo(w * 0.08, s.trackY);
        g.quadraticCurveTo(w * 0.5, s.trackY + bow, w * 0.92, s.trackY);
        g.stroke({ width: 2.4, color: 0xd7c49a, alpha: 0.55 });
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
        g.roundRect(hx - 22, s.trackY - 16, 44, 32, 10);
        g.fill({ color: 0x2a241c, alpha: 0.45 });
        g.roundRect(hx - 24, s.trackY - 18, 48, 34, 11);
        g.fill({ color: active ? 0xf0e2c4 : 0xd4c4a0, alpha: 1 });
        g.roundRect(hx - 24, s.trackY - 18, 48, 34, 11);
        g.stroke({ width: 2, color: 0xfff6e4, alpha: 0.55 });
        g.circle(hx, s.trackY, 5);
        g.fill({ color: 0x5c4a32, alpha: 0.9 });
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
  collection: "field",
  name: "Slider Loom",
  modality: "Mechanical",
  tagline: "Throw the shuttles — the warp leans and the weft seats with a snap.",
  hint: "Drag a shuttle or its track. It snaps into the weave.",
  accent: "#8fa894",
  mount,
};
