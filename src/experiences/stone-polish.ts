import { Container, Graphics } from "pixi.js";
import { rgb } from "@/engine/color";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

/**
 * Stone Polish — rub to raise sheen. High-contrast matte → mirror under the finger.
 */
function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  const COLS = 56;
  const ROWS = 40;
  // Start clearly rough / matte
  const polish = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => Math.random() * 0.05),
  );

  let pointerDown = false;
  let px = 0;
  let py = 0;
  let lpx = 0;
  let lpy = 0;
  let rubAcc = 0;
  let sheenAngle = -0.55;

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
    const stoneW = Math.min(w * 0.78, 560);
    const stoneH = Math.min(h * 0.58, 380);
    return {
      stoneW,
      stoneH,
      sx: (w - stoneW) / 2,
      sy: (h - stoneH) / 2,
      cx: w / 2,
      cy: h / 2,
      rx: stoneW * 0.5,
      ry: stoneH * 0.5,
    };
  }

  function insideStone(x: number, y: number, cx: number, cy: number, rx: number, ry: number) {
    const nx = (x - cx) / rx;
    const ny = (y - cy) / ry;
    return nx * nx + ny * ny <= 1;
  }

  return {
    update(dt: number) {
      const { stoneW, stoneH, sx, sy, cx, cy, rx, ry } = stoneBounds();
      const speed = Math.hypot(px - lpx, py - lpy) / Math.max(dt, 0.001);

      if (pointerDown && insideStone(px, py, cx, cy, rx, ry)) {
        const lx = px - sx;
        const ly = py - sy;
        const c = Math.floor((lx / stoneW) * COLS);
        const r = Math.floor((ly / stoneH) * ROWS);
        const rad = 5;
        // Aggressive polish under finger so change is obvious within a stroke
        const rate = 0.38 * Math.min(1.6, speed / 140 + 0.55);
        for (let dy = -rad; dy <= rad; dy++) {
          for (let dx = -rad; dx <= rad; dx++) {
            const rr = r + dy;
            const cc = c + dx;
            if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
            const fall = 1 - Math.hypot(dx, dy) / (rad + 0.01);
            if (fall <= 0) continue;
            polish[rr][cc] = Math.min(1, polish[rr][cc] + fall * rate);
          }
        }
        rubAcc += speed * dt;
        let sum = 0;
        for (const row of polish) for (const v of row) sum += v;
        const avg = sum / (COLS * ROWS);
        if (rubAcc > 18) {
          // Friction falls as polish rises — quieter / higher scrape
          audio.grain(0.45 * (1 - avg * 0.85), 0.45 + avg * 0.9);
          if (speed > 120) haptics.tap(Math.max(3, Math.floor(14 * (1 - avg))));
          rubAcc = 0;
        }
        sheenAngle += ((px - lpx) / w) * 1.2;
      }
      lpx = px;
      lpy = py;

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x14110e, alpha: 1 });

      const cw = stoneW / COLS;
      const ch = stoneH / ROWS;

      // Matte body first
      g.ellipse(cx, cy, rx, ry);
      g.fill({ color: 0x2a2622, alpha: 1 });

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const x = sx + (c + 0.5) * cw;
          const y = sy + (r + 0.5) * ch;
          if (!insideStone(x, y, cx, cy, rx * 0.98, ry * 0.98)) continue;

          const p = polish[r][c];
          // Specular band moves with rub direction
          const nx = c / COLS - 0.5;
          const ny = r / ROWS - 0.5;
          const sheen = Math.max(
            0,
            1 - Math.abs(nx * Math.cos(sheenAngle) + ny * Math.sin(sheenAngle) - 0.08) * 2.2,
          );
          // Strong contrast: dark matte → bright polished
          const mix = Math.min(1, p * 0.55 + sheen * p * 0.85);
          const rough = 0.08 + Math.sin(c * 1.7 + r * 2.1) * 0.04 * (1 - p);
          const br = (38 + rough * 40) * (1 - mix) + 220 * mix;
          const bg = (34 + rough * 30) * (1 - mix) + 205 * mix;
          const bb = (28 + rough * 20) * (1 - mix) + 175 * mix;
          g.circle(x, y, Math.max(cw, ch) * 0.72);
          g.fill({ color: rgb(br, bg, bb), alpha: 0.95 });
        }
      }

      // Highlight rim grows with overall polish
      let sum = 0;
      for (const row of polish) for (const v of row) sum += v;
      const avg = sum / (COLS * ROWS);
      g.ellipse(cx, cy, rx, ry);
      g.stroke({ width: 2.5 + avg * 2, color: 0xcfc4b0, alpha: 0.25 + avg * 0.45 });

      if (pointerDown) {
        g.circle(px, py, 26);
        g.stroke({ width: 2, color: 0xf0e6d4, alpha: 0.45 });
        g.circle(px, py, 8);
        g.fill({ color: 0xf5efe4, alpha: 0.25 });
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

export const stonePolish: ExperienceModule = {
  id: "stone-polish",
  name: "Stone Polish",
  modality: "Texture",
  tagline: "Rub the surface smooth — sheen rises, friction falls.",
  hint: "Rub in strokes. Watch matte turn to mirror.",
  accent: "#a89a84",
  mount,
};
