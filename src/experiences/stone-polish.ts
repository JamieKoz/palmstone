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

  // polish map — higher = smoother / shinier
  const COLS = 40;
  const ROWS = 28;
  const polish = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => Math.random() * 0.15),
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

  return {
    update(dt: number) {
      const speed = Math.hypot(px - lpx, py - lpy) / Math.max(dt, 0.001);
      if (pointerDown) {
        const cw = w / COLS;
        const ch = h / ROWS;
        const c = Math.floor((px / w) * COLS);
        const r = Math.floor((py / h) * ROWS);
        const rad = 2;
        for (let dy = -rad; dy <= rad; dy++) {
          for (let dx = -rad; dx <= rad; dx++) {
            const rr = r + dy;
            const cc = c + dx;
            if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
            const fall = 1 - Math.hypot(dx, dy) / (rad + 0.01);
            if (fall <= 0) continue;
            const before = polish[rr][cc];
            polish[rr][cc] = Math.min(1, before + fall * 0.08 * Math.min(1, speed / 400 + 0.2));
          }
        }
        rubAcc += speed * dt;
        const avg =
          polish.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0) /
          (COLS * ROWS);
        // friction drops as polish rises — quieter grain
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
      g.rect(0, 0, w, h);
      g.fill({ color: 0x1a1612, alpha: 1 });

      // stone body
      const stoneW = Math.min(w * 0.78, 520);
      const stoneH = Math.min(h * 0.55, 360);
      const sx = (w - stoneW) / 2;
      const sy = (h - stoneH) / 2;

      g.roundRect(sx, sy, stoneW, stoneH, stoneH * 0.45);
      g.fill({ color: 0x3a3630, alpha: 1 });

      const cw = stoneW / COLS;
      const ch = stoneH / ROWS;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const p = polish[r][c];
          // rough dark → polished mid with highlight bias
          const base = 0x2e2a24;
          const lit = 0xb8b0a0;
          const nx = c / COLS - 0.5;
          const ny = r / ROWS - 0.5;
          const sheen = Math.max(
            0,
            1 - Math.abs(nx * Math.cos(sheenAngle) + ny * Math.sin(sheenAngle) - 0.15) * 3,
          );
          const mix = Math.min(1, p * 0.75 + sheen * p * 0.55);
          const br = ((base >> 16) & 255) * (1 - mix) + ((lit >> 16) & 255) * mix;
          const bg = ((base >> 8) & 255) * (1 - mix) + ((lit >> 8) & 255) * mix;
          const bb = (base & 255) * (1 - mix) + (lit & 255) * mix;
          const color = (Math.floor(br) << 16) | (Math.floor(bg) << 8) | Math.floor(bb);
          // only draw inside stone ellipse-ish via roundRect clip approximation
          const x = sx + c * cw;
          const y = sy + r * ch;
          g.rect(x, y, cw + 0.5, ch + 0.5);
          g.fill({ color, alpha: 0.9 });
        }
      }

      // rim
      g.roundRect(sx, sy, stoneW, stoneH, stoneH * 0.45);
      g.stroke({ width: 3, color: 0x8a8070, alpha: 0.5 });

      if (pointerDown) {
        g.circle(px, py, 22);
        g.stroke({ width: 1.5, color: 0xe8dcc8, alpha: 0.3 });
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
  hint: "Rub in strokes. Watch the stone take a polish.",
  accent: "#a89a84",
  mount,
};
