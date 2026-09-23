import { Container, Graphics } from "pixi.js";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Cell = { ink: number; vx: number; vy: number };

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  const COLS = 48;
  const ROWS = 32;
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

  function hslToHex(hh: number, s: number, l: number) {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + hh * 12) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color);
    };
    return (f(0) << 16) | (f(8) << 8) | f(4);
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
        const rad = 2;
        for (let dy = -rad; dy <= rad; dy++) {
          for (let dx = -rad; dx <= rad; dx++) {
            const rr = r + dy;
            const cc = c + dx;
            if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
            const fall = 1 - Math.hypot(dx, dy) / (rad + 0.01);
            if (fall <= 0) continue;
            const cell = field[rr][cc];
            cell.ink = Math.min(1, cell.ink + fall * 0.35);
            cell.vx += pvx * 0.002 * fall;
            cell.vy += pvy * 0.002 * fall;
          }
        }
        emitAcc += Math.hypot(pvx, pvy) * dt;
        if (emitAcc > 40) {
          audio.whoosh(Math.min(0.8, Math.hypot(pvx, pvy) / 1200));
          haptics.tap(5);
          emitAcc = 0;
        }
      }

      // viscous diffusion + advection-ish
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
            0.18;
          next[r][c].ink = Math.max(0, Math.min(1, cell.ink + lap * dt * 8 - cell.ink * 0.015 * dt));
          next[r][c].vx = cell.vx * 0.94;
          next[r][c].vy = cell.vy * 0.94 + 0.02;
          // advect ink toward velocity
          const tc = Math.max(0, Math.min(COLS - 1, c + Math.sign(cell.vx)));
          const tr = Math.max(0, Math.min(ROWS - 1, r + Math.sign(cell.vy)));
          if ((tc !== c || tr !== r) && cell.ink > 0.02) {
            const transfer = cell.ink * 0.08 * Math.min(1, Math.hypot(cell.vx, cell.vy) * 4);
            next[r][c].ink -= transfer;
            next[tr][tc].ink = Math.min(1, next[tr][tc].ink + transfer);
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
      g.fill({ color: 0x0e1618, alpha: 1 });

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const ink = field[r][c].ink;
          if (ink < 0.02) continue;
          const localHue = (hue + ink * 0.12 + c * 0.002) % 1;
          const color = hslToHex(localHue, 0.45 + ink * 0.2, 0.28 + ink * 0.35);
          g.roundRect(c * cw - 1, r * ch - 1, cw + 2, ch + 2, 4);
          g.fill({ color, alpha: 0.35 + ink * 0.65 });
        }
      }

      if (pointerDown) {
        g.circle(px, py, 28);
        g.stroke({ width: 2, color: 0xa8d4c8, alpha: 0.35 });
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

export const silkFluid: ExperienceModule = {
  id: "silk-fluid",
  name: "Silk Fluid",
  modality: "Fluid",
  tagline: "Viscous pour and swirl — color that bleeds slowly.",
  hint: "Drag slowly to pour. Flick to swirl.",
  accent: "#6db3a8",
  mount,
};
