import { BlurFilter, Container, Graphics } from "pixi.js";
import { rgb } from "@/engine/color";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const stoneLayer = new Container();
  layer.addChild(stoneLayer);
  const g = new Graphics();
  stoneLayer.addChild(g);
  const rimG = new Graphics();
  layer.addChild(rimG);

  const blur = new BlurFilter({ strength: 3.5, quality: 2 });
  stoneLayer.filters = [blur];

  // Higher-res polish map — blur softens remaining grain into a continuous sheen.
  const COLS = 64;
  const ROWS = 44;
  const polish = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => Math.random() * 0.12),
  );

  let pointerDown = false;
  let px = 0;
  let py = 0;
  let lpx = 0;
  let lpy = 0;
  let rubAcc = 0;
  let sheenAngle = -0.6;

  const onDown = (e: PointerEvent) => {
    pointerDown = true;
    px = lpx = e.clientX;
    py = lpy = e.clientY;
    void audio.resume();
    haptics.tap(8);
  };
  const onMove = (e: PointerEvent) => {
    px = e.clientX;
    py = e.clientY;
  };
  const onUp = () => {
    pointerDown = false;
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  function stoneBounds() {
    const stoneW = Math.min(w * 0.78, 520);
    const stoneH = Math.min(h * 0.55, 360);
    return {
      stoneW,
      stoneH,
      sx: (w - stoneW) / 2,
      sy: (h - stoneH) / 2,
      rx: stoneW * 0.5,
      ry: stoneH * 0.5,
    };
  }

  function insideStone(nx: number, ny: number, rx: number, ry: number) {
    // Ellipse test in local stone space (nx/ny from -0.5..0.5-ish center)
    return (nx * nx) / (rx * rx) + (ny * ny) / (ry * ry) <= 1.02;
  }

  return {
    update(dt: number) {
      const { stoneW, stoneH, sx, sy, rx, ry } = stoneBounds();
      const speed = Math.hypot(px - lpx, py - lpy) / Math.max(dt, 0.001);

      if (pointerDown) {
        const lx = px - sx;
        const ly = py - sy;
        const c = Math.floor((lx / stoneW) * COLS);
        const r = Math.floor((ly / stoneH) * ROWS);
        const rad = 3;
        for (let dy = -rad; dy <= rad; dy++) {
          for (let dx = -rad; dx <= rad; dx++) {
            const rr = r + dy;
            const cc = c + dx;
            if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
            const fall = 1 - Math.hypot(dx, dy) / (rad + 0.01);
            if (fall <= 0) continue;
            polish[rr][cc] = Math.min(
              1,
              polish[rr][cc] + fall * 0.07 * Math.min(1, speed / 400 + 0.2),
            );
          }
        }
        rubAcc += speed * dt;
        let sum = 0;
        for (const row of polish) for (const v of row) sum += v;
        const avg = sum / (COLS * ROWS);
        if (rubAcc > 25) {
          audio.grain(0.35 * (1 - avg * 0.7), 0.5 + avg);
          if (speed > 200) haptics.tap(Math.max(4, Math.floor(12 * (1 - avg))));
          rubAcc = 0;
        }
        sheenAngle += ((px - lpx) / w) * 0.8;
      }
      lpx = px;
      lpy = py;

      g.clear();
      rimG.clear();

      rimG.rect(0, 0, w, h);
      rimG.fill({ color: 0x1a1612, alpha: 1 });

      const cw = stoneW / COLS;
      const ch = stoneH / ROWS;
      const cellR = Math.max(cw, ch) * 0.75;

      // Soft stone body base
      g.ellipse(sx + rx, sy + ry, rx, ry);
      g.fill({ color: 0x35312c, alpha: 1 });

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const x = sx + (c + 0.5) * cw;
          const y = sy + (r + 0.5) * ch;
          const nx = x - (sx + rx);
          const ny = y - (sy + ry);
          if (!insideStone(nx, ny, rx, ry)) continue;

          const p = polish[r][c];
          const sheen = Math.max(
            0,
            1 -
              Math.abs(
                (c / COLS - 0.5) * Math.cos(sheenAngle) +
                  (r / ROWS - 0.5) * Math.sin(sheenAngle) -
                  0.12,
              ) *
                2.8,
          );
          const mix = Math.min(1, p * 0.78 + sheen * p * 0.55);
          const br = 46 * (1 - mix) + 184 * mix;
          const bg = 42 * (1 - mix) + 176 * mix;
          const bb = 36 * (1 - mix) + 160 * mix;
          g.circle(x, y, cellR);
          g.fill({ color: rgb(br, bg, bb), alpha: 0.85 });
        }
      }

      rimG.ellipse(sx + rx, sy + ry, rx, ry);
      rimG.stroke({ width: 3, color: 0x8a8070, alpha: 0.45 });

      if (pointerDown) {
        rimG.circle(px, py, 22);
        rimG.stroke({ width: 1.5, color: 0xe8dcc8, alpha: 0.3 });
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
      stoneLayer.filters = null;
      blur.destroy();
      layer.destroy({ children: true });
    },
  };
}

export const stonePolish: ExperienceModule = {
  id: "stone-polish",
  name: "Stone Polish",
  modality: "Texture",
  tagline: "Rub the surface smooth — sheen rises, friction falls.",
  hint: "Rub in strokes. Watch the stone take a polish.",
  accent: "#a89a84",
  mount,
};
