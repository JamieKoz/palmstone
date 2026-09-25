import { Container, Graphics } from "pixi.js";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Node = {
  x: number;
  y: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
};

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  const COLS = 7;
  const ROWS = 9;
  const nodes: Node[] = [];
  const edges: [number, number][] = [];

  function layout() {
    nodes.length = 0;
    edges.length = 0;
    const padX = w * 0.12;
    const padY = h * 0.1;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = padX + (c / (COLS - 1)) * (w - padX * 2);
        const y = padY + (r / (ROWS - 1)) * (h - padY * 2);
        nodes.push({ x, y, ox: x, oy: y, vx: 0, vy: 0 });
      }
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        if (c < COLS - 1) edges.push([i, i + 1]);
        if (r < ROWS - 1) edges.push([i, i + COLS]);
        if (c < COLS - 1 && r < ROWS - 1) {
          edges.push([i, i + COLS + 1]);
          edges.push([i + 1, i + COLS]);
        }
      }
    }
  }
  layout();

  let drag: number | null = null;
  let px = 0;
  let py = 0;
  let stretchAcc = 0;
  let peakStretch = 0;

  const nearest = (x: number, y: number) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = Math.hypot(nodes[i].x - x, nodes[i].y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return bestD < 64 ? best : null;
  };

  const onDown = (e: PointerEvent) => {
    px = e.clientX;
    py = e.clientY;
    drag = nearest(px, py);
    void audio.resume();
    stretchAcc = 0;
    peakStretch = 0;
    if (drag != null) {
      haptics.tap(10);
      audio.click(0.2, 0.85);
    }
  };
  const onMove = (e: PointerEvent) => {
    px = e.clientX;
    py = e.clientY;
  };
  const onUp = () => {
    if (drag != null) {
      const snap = Math.min(1, peakStretch / 140);
      audio.elasticRelease(0.55 + snap * 0.45, 0.85 + snap * 0.7);
      haptics.pattern([0, 8, 20, 12]);
    }
    drag = null;
    peakStretch = 0;
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  let twangAcc = 0;

  return {
    update(dt: number) {
      const k = 38;
      const damp = Math.pow(0.9, dt * 60);

      if (drag != null) {
        const n = nodes[drag];
        n.x = px;
        n.y = py;
        n.vx = 0;
        n.vy = 0;
        const pull = Math.hypot(n.x - n.ox, n.y - n.oy);
        peakStretch = Math.max(peakStretch, pull);
        stretchAcc += pull * dt;
        if (stretchAcc > 14) {
          const tension = Math.min(1, pull / 120);
          audio.elastic(0.35 + tension * 0.4, 0.75 + tension * 0.65);
          if (tension > 0.3) haptics.tap(4);
          stretchAcc = 0;
        }
      }

      for (let i = 0; i < nodes.length; i++) {
        if (i === drag) continue;
        const n = nodes[i];
        const fx = (n.ox - n.x) * k;
        const fy = (n.oy - n.y) * k;
        n.vx = (n.vx + fx * dt) * damp;
        n.vy = (n.vy + fy * dt) * damp;
        n.x += n.vx * dt;
        n.y += n.vy * dt;
      }

      // edge spring coupling
      for (const [a, b] of edges) {
        const na = nodes[a];
        const nb = nodes[b];
        const dx = nb.x - na.x;
        const dy = nb.y - na.y;
        const dist = Math.hypot(dx, dy) || 1;
        const rest = Math.hypot(nb.ox - na.ox, nb.oy - na.oy);
        const stretch = dist - rest;
        const f = stretch * 22;
        const nx = dx / dist;
        const ny = dy / dist;
        if (a !== drag) {
          na.vx += nx * f * dt;
          na.vy += ny * f * dt;
        }
        if (b !== drag) {
          nb.vx -= nx * f * dt;
          nb.vy -= ny * f * dt;
        }
      }

      let energy = 0;
      for (const n of nodes) energy += Math.hypot(n.vx, n.vy);
      twangAcc += energy * dt;
      if (twangAcc > 120 && drag == null) {
        audio.tone(140 + Math.min(200, energy), 0.12, 0.15);
        twangAcc = 0;
      }

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x14110f, alpha: 1 });

      for (const [a, b] of edges) {
        const na = nodes[a];
        const nb = nodes[b];
        const stretch = Math.hypot(nb.x - na.x, nb.y - na.y) /
          (Math.hypot(nb.ox - na.ox, nb.oy - na.oy) || 1);
        const alpha = 0.35 + Math.min(0.5, Math.abs(stretch - 1) * 1.5);
        g.moveTo(na.x, na.y);
        g.lineTo(nb.x, nb.y);
        g.stroke({ width: 1.6, color: 0xd8c3a0, alpha });
      }

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const active = i === drag;
        g.circle(n.x, n.y, active ? 9 : 6);
        g.fill({ color: active ? 0xf0d9a8 : 0xc9a66b, alpha: 1 });
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

export const elasticWeb: ExperienceModule = {
  id: "elastic-web",
  collection: "studio",
  name: "Elastic Web",
  modality: "Elastic",
  tagline: "Pull nodes — spring-back and harmonic wobble.",
  hint: "Grab a node and pull. Release to watch it settle.",
  accent: "#c9a66b",
  mount,
};
