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
  const rows: { label: string; u: number }[][] = [
    [
      { label: "tab", u: 1.45 },
      ..."QWERTYUIOP".split("").map((label) => ({ label, u: 1 })),
      { label: "bksp", u: 1.7 },
    ],
    [
      { label: "caps", u: 1.7 },
      ..."ASDFGHJKL".split("").map((label) => ({ label, u: 1 })),
      { label: "enter", u: 1.85 },
    ],
    [
      { label: "shift", u: 2.2 },
      ..."ZXCVBNM".split("").map((label) => ({ label, u: 1 })),
      { label: "shift", u: 2.25 },
    ],
    [{ label: "", u: 6.4 }],
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
    const gap = Math.min(14, Math.max(4, Math.min(w, h) * 0.012));
    const usableW = w * 0.94;
    const topUnits = rows[0].reduce((sum, key) => sum + key.u, 0);
    const unit = (usableW - gap * (rows[0].length - 1)) / topUnits;
    const keyH = Math.min(unit * 1.05, h * 0.16);
    const totalH = rows.length * keyH + (rows.length - 1) * gap;
    const originY = (h - totalH) / 2;
    let i = 0;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const rowUnits = row.reduce((sum, key) => sum + key.u, 0);
      const rowW = rowUnits * unit + gap * (row.length - 1);
      let x = (w - rowW) / 2;
      for (const spec of row) {
        const keyW = spec.u * unit;
        const k: Key = {
          x,
          y: originY + r * (keyH + gap),
          w: keyW,
          h: keyH,
          label: spec.label,
          pitch: 0.72 + (i % 9) * 0.04,
          press: 0,
        };
        if (spec.label) {
          const t = new Text({
            text: spec.label,
            style: {
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              fontSize: Math.max(10, Math.min(16, Math.min(keyW, keyH) * (spec.label.length > 1 ? 0.22 : 0.36))),
              fill: 0xc5d0d8,
              fontWeight: "600",
            },
          });
          t.anchor.set(0.5);
          labels.addChild(t);
          k.labelText = t;
        }
        keys.push(k);
        x += keyW + gap;
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

  const held = new Set<number>();
  let pointerDown = false;

  const el = ctx.app.canvas;

  const toLocal = (clientX: number, clientY: number) => {
    const rect = el.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / Math.max(rect.width, 1)) * w,
      y: ((clientY - rect.top) / Math.max(rect.height, 1)) * h,
    };
  };

  const pressKey = (i: number) => {
    if (held.has(i)) return;
    held.add(i);
    keys[i].press = 1;
    audio.keyStroke("down", 0.9, keys[i].pitch);
    haptics.tap(12);
  };

  const releaseKey = (i: number) => {
    if (!held.has(i)) return;
    held.delete(i);
    audio.keyStroke("up", 0.85, keys[i].pitch);
  };

  const setUnderPointer = (i: number | null) => {
    for (const heldIndex of [...held]) {
      if (heldIndex !== i) releaseKey(heldIndex);
    }
    if (i != null) pressKey(i);
  };

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    pointerDown = true;
    const p = toLocal(e.clientX, e.clientY);
    setUnderPointer(hit(p.x, p.y));
  };
  const onMove = (e: PointerEvent) => {
    if (!pointerDown) return;
    const p = toLocal(e.clientX, e.clientY);
    setUnderPointer(hit(p.x, p.y));
  };
  const onUp = () => {
    pointerDown = false;
    for (const i of [...held]) releaseKey(i);
  };

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  const DEPTH = 10; // visual key side wall height

  return {
    update(dt: number) {
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (held.has(i)) k.press = 1;
        else k.press = Math.max(0, k.press - dt * 7);
      }

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
  collection: "field",
  name: "Keyboard Thock",
  modality: "Click",
  tagline: "Chunky bottom-out — soft plastic thock under the finger.",
  hint: "Tap a key, or drag across the board. Release lifts the key.",
  accent: "#7a8a98",
  mount,
};
