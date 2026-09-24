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

  let open = 0.35; // 0 closed (bottom), 1 open (top)
  let target = 0.35;
  let dragging = false;
  let lastOpen = 0.35;
  let toothPhase = 0;

  const track = () => {
    const top = h * 0.16;
    const bottom = h * 0.86;
    return { cx: w * 0.5, top, bottom, len: bottom - top };
  };

  const sliderY = () => {
    const t = track();
    return t.bottom - open * t.len;
  };

  const hit = (x: number, y: number) => {
    const t = track();
    const sy = sliderY();
    if (Math.hypot(x - t.cx, y - sy) < 36) return true;
    return Math.abs(x - t.cx) < 40 && y >= t.top - 10 && y <= t.bottom + 10;
  };

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    if (!hit(e.clientX, e.clientY)) return;
    dragging = true;
    lastOpen = open;
    haptics.tap(8);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const t = track();
    target = Math.max(0, Math.min(1, (t.bottom - e.clientY) / t.len));
  };
  const onUp = () => {
    dragging = false;
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  return {
    update(dt: number) {
      open += (target - open) * Math.min(1, dt * (dragging ? 22 : 10));
      const dOpen = open - lastOpen;
      if (Math.abs(dOpen) > 0.0008) {
        // Accumulate travel in "tooth" units — denser bumps = real zipper teeth
        toothPhase += Math.abs(dOpen) * 140;
        let teeth = 0;
        while (toothPhase > 1 && teeth < 6) {
          toothPhase -= 1;
          teeth++;
          const speed = Math.min(1, Math.abs(dOpen) / Math.max(0.008, dt));
          const direction = dOpen > 0 ? "open" : "close";
          // Slow → deep, fast → high zip (room to climb)
          const pitch = 0.5 + speed * 1.9;
          audio.zip(0.4 + speed * 0.5, pitch, direction);
          if (speed > 0.25 && teeth === 1) haptics.tap(2 + Math.round(speed * 6));
        }
        if (toothPhase > 1) toothPhase = toothPhase % 1;
      }
      lastOpen = open;

      const t = track();
      const sy = sliderY();
      const half = Math.min(w * 0.22, 90);

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x14161a, alpha: 1 });

      // Fabric panels
      const split = open;
      // Left panel (opens left as zipper rises)
      g.moveTo(t.cx - 4, t.top);
      g.lineTo(t.cx - 4 - half * split, t.top);
      g.lineTo(t.cx - 4 - half * split, t.bottom);
      g.lineTo(t.cx - 4, t.bottom);
      g.closePath();
      g.fill({ color: 0x3a4a5a, alpha: 0.95 });

      g.moveTo(t.cx + 4, t.top);
      g.lineTo(t.cx + 4 + half * split, t.top);
      g.lineTo(t.cx + 4 + half * split, t.bottom);
      g.lineTo(t.cx + 4, t.bottom);
      g.closePath();
      g.fill({ color: 0x324050, alpha: 0.95 });

      // Closed fabric below slider
      g.rect(t.cx - half * 0.15, sy, half * 0.3, t.bottom - sy);
      g.fill({ color: 0x2a3848, alpha: 0.9 });

      // Teeth
      const toothH = 10;
      const n = Math.floor(t.len / toothH);
      for (let i = 0; i < n; i++) {
        const y = t.top + i * toothH;
        const along = 1 - (y - t.top) / t.len;
        if (along > open) {
          // meshed
          g.roundRect(t.cx - 7, y, 14, toothH * 0.7, 2);
          g.fill({ color: 0xc4b080, alpha: 0.85 });
        } else {
          // open sides
          g.roundRect(t.cx - 4 - half * open * 0.35 - 10, y, 10, toothH * 0.65, 2);
          g.fill({ color: 0xb0a070, alpha: 0.7 });
          g.roundRect(t.cx + 4 + half * open * 0.35, y, 10, toothH * 0.65, 2);
          g.fill({ color: 0xb0a070, alpha: 0.7 });
        }
      }

      // Tape edges
      g.moveTo(t.cx - 3, t.top);
      g.lineTo(t.cx - 3, t.bottom);
      g.stroke({ width: 2, color: 0x1a222c, alpha: 0.8 });
      g.moveTo(t.cx + 3, t.top);
      g.lineTo(t.cx + 3, t.bottom);
      g.stroke({ width: 2, color: 0x1a222c, alpha: 0.8 });

      // Slider body
      g.roundRect(t.cx - 18, sy - 22, 36, 44, 6);
      g.fill({ color: 0xd4c490, alpha: 1 });
      g.roundRect(t.cx - 14, sy - 16, 28, 14, 4);
      g.fill({ color: 0xf0e6c0, alpha: 0.55 });

      // Pull tab
      g.moveTo(t.cx - 8, sy + 18);
      g.lineTo(t.cx + 8, sy + 18);
      g.lineTo(t.cx + 6, sy + 42);
      g.lineTo(t.cx - 6, sy + 42);
      g.closePath();
      g.fill({ color: 0xc4b080, alpha: 0.95 });
      g.circle(t.cx, sy + 48, 7);
      g.stroke({ width: 2.5, color: 0xc4b080, alpha: 0.95 });
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

export const zipper: ExperienceModule = {
  id: "zipper",
  name: "Zipper",
  modality: "Slide",
  tagline: "Pull the slider — teeth chatter open and shut.",
  hint: "Drag the zipper up and down.",
  accent: "#c4b080",
  mount,
};
