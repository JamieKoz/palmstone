import { BlurFilter, Container, Graphics } from "pixi.js";
import { hslToRgb } from "@/engine/color";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Cell = { ink: number; vx: number; vy: number };

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const fluidLayer = new Container();
  layer.addChild(fluidLayer);
  const g = new Graphics();
  fluidLayer.addChild(g);
  const cursorG = new Graphics();
  layer.addChild(cursorG);

  const blur = new BlurFilter({ strength: 8, quality: 3 });
  fluidLayer.filters = [blur];

  const COLS = 56;
  const ROWS = 36;
  const field: Cell[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ ink: 0, vx: 0, vy: 0 })),
  );

  let hue = 0.55;
  let pointerDown = false;
  let px = 0;
  let py = 0;
  let lpx = 0;
  let lpy = 0;
  let emitAcc = 0;

  const onDown = (e: PointerEvent) => {
    pointerDown = true;
    px = lpx = e.clientX;
    py = lpy = e.clientY;
    void audio.resume();
    haptics.tap(10);
    hue = (hue + 0.07) % 1;
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

  function cellAt(x: number, y: number) {
    const c = Math.max(0, Math.min(COLS - 1, Math.floor((x / w) * COLS)));
    const r = Math.max(0, Math.min(ROWS - 1, Math.floor((y / h) * ROWS)));
    return { c, r };
  }

  return {
    update(dt: number) {
      const cw = w / COLS;
      const ch = h / ROWS;
      const pvx = (px - lpx) / Math.max(dt, 0.001);
      const pvy = (py - lpy) / Math.max(dt, 0.001);
      lpx = px;
      lpy = py;

      if (pointerDown) {
        const { c, r } = cellAt(px, py);
        const rad = 3;
        for (let dy = -rad; dy <= rad; dy++) {
          for (let dx = -rad; dx <= rad; dx++) {
            const rr = r + dy;
            const cc = c + dx;
            if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
            const fall = 1 - Math.hypot(dx, dy) / (rad + 0.01);
            if (fall <= 0) continue;
            const cell = field[rr][cc];
            cell.ink = Math.min(1, cell.ink + fall * 0.28);
            cell.vx += pvx * 0.0028 * fall;
            cell.vy += pvy * 0.0028 * fall;
          }
        }
        emitAcc += Math.hypot(pvx, pvy) * dt;
        if (emitAcc > 40) {
          audio.whoosh(Math.min(0.8, Math.hypot(pvx, pvy) / 1200));
          haptics.tap(5);
          emitAcc = 0;
        }
      }

      // Viscous diffusion + swirl advection
      const next = field.map((row) => row.map((c) => ({ ...c })));
      for (let r = 1; r < ROWS - 1; r++) {
        for (let c = 1; c < COLS - 1; c++) {
          const cell = field[r][c];
          const lap =
            (field[r][c - 1].ink +
              field[r][c + 1].ink +
              field[r - 1][c].ink +
              field[r + 1][c].ink -
              4 * cell.ink) *
            0.22;
          // Mild curl so pours keep swirling
          const curl =
            (field[r][c + 1].vy - field[r][c - 1].vy - (field[r + 1][c].vx - field[r - 1][c].vx)) *
            0.08;
          next[r][c].ink = Math.max(
            0,
            Math.min(1, cell.ink + lap * dt * 10 - cell.ink * 0.012 * dt),
          );
          next[r][c].vx = cell.vx * 0.96 - curl * 0.4;
          next[r][c].vy = cell.vy * 0.96 + 0.015 + curl * 0.15;

          const speed = Math.hypot(cell.vx, cell.vy);
          if (cell.ink > 0.015 && speed > 0.02) {
            const tc = Math.max(
              0,
              Math.min(COLS - 1, c + Math.round(Math.sign(cell.vx) * Math.min(2, Math.abs(cell.vx) * 8))),
            );
            const tr = Math.max(
              0,
              Math.min(ROWS - 1, r + Math.round(Math.sign(cell.vy) * Math.min(2, Math.abs(cell.vy) * 8))),
            );
            if (tc !== c || tr !== r) {
              const transfer = cell.ink * 0.12 * Math.min(1, speed * 5);
              next[r][c].ink -= transfer;
              next[tr][tc].ink = Math.min(1, next[tr][tc].ink + transfer);
              next[tr][tc].vx += cell.vx * 0.08;
              next[tr][tc].vy += cell.vy * 0.08;
            }
          }
        }
      }
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          field[r][c] = next[r][c];
        }
      }

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x0c1416, alpha: 1 });

      const cellR = Math.max(cw, ch) * 0.95;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const ink = field[r][c].ink;
          if (ink < 0.03) continue;
          const localHue = (hue + ink * 0.14 + c * 0.0015 + r * 0.001) % 1;
          const color = hslToRgb(localHue, 0.42 + ink * 0.25, 0.26 + ink * 0.38);
          const x = (c + 0.5) * cw;
          const y = (r + 0.5) * ch;
          g.circle(x, y, cellR * (0.7 + ink * 0.55));
          g.fill({ color, alpha: 0.28 + ink * 0.7 });
        }
      }

      cursorG.clear();
      if (pointerDown) {
        cursorG.circle(px, py, 30);
        cursorG.stroke({ width: 2, color: 0xa8d4c8, alpha: 0.35 });
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
      fluidLayer.filters = null;
      blur.destroy();
      layer.destroy({ children: true });
    },
  };
}

export const silkFluid: ExperienceModule = {
  id: "silk-fluid",
  name: "Silk Fluid",
  modality: "Fluid",
  tagline: "Viscous pour and swirl — color that bleeds slowly.",
  hint: "Drag slowly to pour. Flick to swirl.",
  accent: "#6db3a8",
  mount,
};
