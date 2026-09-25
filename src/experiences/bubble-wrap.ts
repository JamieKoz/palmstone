import { Container, Graphics } from "pixi.js";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Bubble = {
  x: number;
  y: number;
  r: number;
  popped: boolean;
  popAnim: number;
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

  const bubbles: Bubble[] = [];

  function layout(keepState = false) {
    const prev = keepState
      ? new Map(bubbles.map((b, i) => [i, { popped: b.popped, popAnim: b.popAnim }] as const))
      : null;
    bubbles.length = 0;
    const narrow = w < 560;
    // Twice as many per row as the original grid; keep the original bubble radius
    const cols = narrow ? 10 : 16;
    const rows = narrow ? 7 : 6;
    const sizeCols = narrow ? 5 : 8;
    const marginX = w * 0.08;
    const marginY = h * 0.12;
    const cellW = (w - marginX * 2) / cols;
    const cellH = (h - marginY * 2) / rows;
    const sizeCellW = (w - marginX * 2) / sizeCols;
    const r = Math.min(sizeCellW, cellH) * 0.38;
    let i = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const offset = row % 2 === 1 ? cellW * 0.5 : 0;
        if (row % 2 === 1 && col === cols - 1) continue;
        const state = prev?.get(i);
        bubbles.push({
          x: marginX + cellW * (col + 0.5) + offset,
          y: marginY + cellH * (row + 0.5),
          r,
          popped: state?.popped ?? false,
          popAnim: state?.popAnim ?? 0,
          pitch: 0.85 + ((col + row) % 5) * 0.08,
        });
        i++;
      }
    }
  }
  layout();

  const hit = (x: number, y: number) => {
    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i];
      if (!b.popped && Math.hypot(b.x - x, b.y - y) < b.r * 1.05) return i;
    }
    return null;
  };

  const popOne = (i: number) => {
    const b = bubbles[i];
    if (b.popped) return;
    b.popped = true;
    b.popAnim = 1;
    audio.pop(0.85, b.pitch);
    haptics.tap(8);
    if (bubbles.every((x) => x.popped)) {
      // refill after a beat
      window.setTimeout(() => {
        for (const bubble of bubbles) {
          bubble.popped = false;
          bubble.popAnim = 0;
        }
        audio.whoosh(0.25);
      }, 700);
    }
  };

  let pointerDown = false;
  const onPointerDown = (e: PointerEvent) => {
    pointerDown = true;
    void audio.resume();
    const i = hit(e.clientX, e.clientY);
    if (i != null) popOne(i);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!pointerDown) return;
    const i = hit(e.clientX, e.clientY);
    if (i != null) popOne(i);
  };
  const onPointerUp = () => {
    pointerDown = false;
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  el.style.touchAction = "none";

  return {
    update(dt: number) {
      for (const b of bubbles) {
        if (b.popAnim > 0) b.popAnim = Math.max(0, b.popAnim - dt * 3.2);
      }

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x14181c, alpha: 1 });

      // Sheet
      if (bubbles.length) {
        const pad = bubbles[0].r * 1.4;
        const minX = Math.min(...bubbles.map((b) => b.x)) - pad;
        const minY = Math.min(...bubbles.map((b) => b.y)) - pad;
        const maxX = Math.max(...bubbles.map((b) => b.x)) + pad;
        const maxY = Math.max(...bubbles.map((b) => b.y)) + pad;
        g.roundRect(minX, minY, maxX - minX, maxY - minY, 14);
        g.fill({ color: 0x2a3a42, alpha: 0.55 });
      }

      for (const b of bubbles) {
        if (b.popped) {
          const rr = b.r * (0.55 + b.popAnim * 0.2);
          g.circle(b.x, b.y, rr);
          g.stroke({ width: 1.5, color: 0x4a5a62, alpha: 0.45 });
          g.circle(b.x - rr * 0.15, b.y - rr * 0.1, rr * 0.18);
          g.fill({ color: 0x1a2228, alpha: 0.5 });
          continue;
        }
        g.circle(b.x, b.y, b.r);
        g.fill({ color: 0x6a9aaa, alpha: 0.55 });
        g.circle(b.x - b.r * 0.28, b.y - b.r * 0.28, b.r * 0.35);
        g.fill({ color: 0xffffff, alpha: 0.35 });
        g.circle(b.x, b.y, b.r);
        g.stroke({ width: 1.5, color: 0xa8d0dc, alpha: 0.45 });
      }
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
      layout(true);
    },
    destroy() {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      layer.destroy({ children: true });
    },
  };
}

export const bubbleWrap: ExperienceModule = {
  id: "bubble-wrap",
  collection: "field",
  name: "Bubble Wrap",
  modality: "Pop",
  tagline: "Pop every blister — soft membrane snap.",
  hint: "Tap or drag to pop. Sheet refills when empty.",
  accent: "#6a9aaa",
  mount,
};
