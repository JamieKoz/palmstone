import { Container, Graphics, Text } from "pixi.js";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Key = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  pitch: number;
  press: number;
  labelText?: Text;
};

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);
  const labels = new Container();
  layer.addChild(labels);

  const keys: Key[] = [];
  const rows = [
    ["Q", "W", "E", "R", "T", "Y"],
    ["A", "S", "D", "F", "G", "H"],
    ["Z", "X", "C", "V", "B", "N"],
  ];

  function clearLabels() {
    for (const k of keys) {
      k.labelText?.destroy();
      k.labelText = undefined;
    }
    labels.removeChildren();
  }

  function layout() {
    clearLabels();
    keys.length = 0;
    const narrow = w < 560;
    const cols = narrow ? 4 : 6;
    const rowCount = 3;
    const gap = Math.min(w, h) * (narrow ? 0.02 : 0.016);
    const usableW = w * (narrow ? 0.9 : 0.78);
    // Deeper keycaps — taller than wide-ish square
    const keyW = (usableW - gap * (cols - 1)) / cols;
    const keyH = Math.min(keyW * 1.15, h * 0.155);
    const totalH = rowCount * keyH + (rowCount - 1) * gap;
    const originX = (w - usableW) / 2;
    const originY = (h - totalH) / 2;
    let i = 0;
    for (let r = 0; r < rowCount; r++) {
      const row = rows[r];
      const count = Math.min(cols, row.length);
      const rowOffset = r === 1 ? keyW * 0.2 : r === 2 ? keyW * 0.4 : 0;
      for (let c = 0; c < count; c++) {
        const k: Key = {
          x: originX + rowOffset + c * (keyW + gap),
          y: originY + r * (keyH + gap),
          w: keyW,
          h: keyH,
          label: row[c],
          // Deeper / lower pitches for a chunkier thock
          pitch: 0.62 + (i % 7) * 0.045,
          press: 0,
        };
        const t = new Text({
          text: k.label,
          style: {
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            fontSize: Math.max(14, Math.min(22, keyW * 0.28)),
            fill: 0xc5d0d8,
            fontWeight: "600",
          },
        });
        t.anchor.set(0.5);
        labels.addChild(t);
        k.labelText = t;
        keys.push(k);
        i++;
      }
    }
  }
  layout();

  const hit = (x: number, y: number) => {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      // Include the raised side wall in the hit area
      if (x >= k.x && x <= k.x + k.w && y >= k.y - 6 && y <= k.y + k.h + 4) return i;
    }
    return null;
  };

  const active = new Set<number>();
  let pointerDown = false;

  const strike = (i: number) => {
    if (active.has(i)) return;
    active.add(i);
    const k = keys[i];
    k.press = 1;
    audio.thock(0.85 + (i % 3) * 0.06, k.pitch);
    haptics.tap(14 + (i % 4));
  };

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    pointerDown = true;
    const i = hit(e.clientX, e.clientY);
    if (i != null) strike(i);
  };
  const onMove = (e: PointerEvent) => {
    if (!pointerDown) return;
    const i = hit(e.clientX, e.clientY);
    if (i != null) strike(i);
  };
  const onUp = () => {
    pointerDown = false;
    active.clear();
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  const DEPTH = 10; // visual key side wall height

  return {
    update(dt: number) {
      for (const k of keys) k.press = Math.max(0, k.press - dt * 4.2);

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x101214, alpha: 1 });

      if (keys.length) {
        const pad = 22;
        const minX = Math.min(...keys.map((k) => k.x)) - pad;
        const minY = Math.min(...keys.map((k) => k.y)) - pad - DEPTH;
        const maxX = Math.max(...keys.map((k) => k.x + k.w)) + pad;
        const maxY = Math.max(...keys.map((k) => k.y + k.h)) + pad + 6;
        g.roundRect(minX, minY, maxX - minX, maxY - minY, 18);
        g.fill({ color: 0x1a2026, alpha: 0.96 });
        g.roundRect(minX, minY, maxX - minX, maxY - minY, 18);
        g.stroke({ width: 2, color: 0x2e3840, alpha: 0.9 });
      }

      for (const k of keys) {
        const travel = DEPTH * 0.85;
        const drop = k.press * travel;
        const wall = DEPTH - drop;

        // Deep well
        g.roundRect(k.x - 1, k.y - 1, k.w + 2, k.h + DEPTH + 2, 10);
        g.fill({ color: 0x07090b, alpha: 0.9 });

        // Side wall (key body depth)
        if (wall > 0.5) {
          g.roundRect(k.x, k.y + drop + k.h * 0.55, k.w, wall + k.h * 0.35, 8);
          g.fill({ color: 0x1a2228, alpha: 1 });
          g.roundRect(k.x, k.y + drop + k.h * 0.55, k.w, wall + k.h * 0.35, 8);
          g.stroke({ width: 1, color: 0x0c1014, alpha: 0.8 });
        }

        // Cap top
        const capH = k.h - drop * 0.15;
        g.roundRect(k.x, k.y + drop, k.w, capH, 9);
        g.fill({ color: k.press > 0.25 ? 0x3e4a54 : 0x2c3640, alpha: 1 });
        // Bevel highlight
        g.roundRect(k.x + 3, k.y + drop + 3, k.w - 6, capH * 0.32, 6);
        g.fill({ color: 0xffffff, alpha: 0.07 + (1 - k.press) * 0.06 });
        // Bottom lip
        g.roundRect(k.x + 4, k.y + drop + capH - 7, k.w - 8, 4, 2);
        g.fill({ color: 0x000000, alpha: 0.18 });

        if (k.labelText) {
          k.labelText.x = k.x + k.w * 0.5;
          k.labelText.y = k.y + drop + capH * 0.42;
          k.labelText.alpha = 0.55 + k.press * 0.35;
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
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      clearLabels();
      layer.destroy({ children: true });
    },
  };
}

export const keyboardThock: ExperienceModule = {
  id: "keyboard-thock",
  name: "Keyboard Thock",
  modality: "Click",
  tagline: "Chunky bottom-out — soft plastic thock under the finger.",
  hint: "Tap the keys. Drag across for a cascade.",
  accent: "#7a8a98",
  mount,
};
