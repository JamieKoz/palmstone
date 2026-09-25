import { Container, Graphics } from "pixi.js";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Cord = {
  x: number;
  offset: number;
  vel: number;
  side: number;
};

/**
 * Slider Loom — one shuttle through a warp of cords.
 * Drag it across. The cords bow and pluck, then spring home when you let go.
 */
function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  const canvas = ctx.app.canvas;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  const cords: Cord[] = [];
  let shuttleX = 0;
  let shuttleY = 0;
  let svx = 0;
  let svy = 0;
  let held = false;
  let px = 0;
  let py = 0;
  let glide: number | null = null;

  function layout(keepMotion = false) {
    const n = 11;
    const left = w * 0.14;
    const right = w * 0.86;
    const prev = keepMotion ? cords.map((c) => ({ offset: c.offset, vel: c.vel, side: c.side })) : [];
    cords.length = 0;
    for (let i = 0; i < n; i++) {
      cords.push({
        x: left + ((right - left) * i) / (n - 1),
        offset: prev[i]?.offset ?? 0,
        vel: prev[i]?.vel ?? 0,
        side: prev[i]?.side ?? 0,
      });
    }
    if (!keepMotion) {
      shuttleX = w * 0.5;
      shuttleY = h * 0.5;
    }
  }
  layout();

  const local = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * w,
      y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * h,
    };
  };

  const onDown = (e: PointerEvent) => {
    const p = local(e);
    px = p.x;
    py = p.y;
    held = true;
    glide = null;
    void audio.resume();
    haptics.tap(8);
    audio.click(0.22, 0.9);
  };
  const onMove = (e: PointerEvent) => {
    const p = local(e);
    px = p.x;
    py = p.y;
  };
  const onUp = () => {
    if (!held) return;
    held = false;
    const left = w * 0.16;
    const right = w * 0.84;
    const flung = Math.abs(svx) > 240;
    glide = flung ? (svx > 0 ? right : left) : shuttleX < w * 0.5 ? left : right;
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  canvas.style.touchAction = "none";

  const top = () => h * 0.16;
  const bot = () => h * 0.84;

  return {
    update(dt: number) {
      const damp = Math.pow(0.86, dt * 60);
      if (held) {
        svx += (px - shuttleX) * 22 * dt * 60 * 0.15;
        svy += (py - shuttleY) * 22 * dt * 60 * 0.15;
      } else if (glide != null) {
        svx += (glide - shuttleX) * 28 * dt;
        svy += (h * 0.5 - shuttleY) * 8 * dt;
        if (Math.abs(shuttleX - glide) < 10 && Math.abs(svx) < 80) {
          shuttleX = glide;
          svx = 0;
          svy = 0;
          glide = null;
          audio.pluck(0.4, 2);
          haptics.tap(14);
        }
      } else {
        svx *= damp;
        svy *= damp;
      }
      svx *= damp;
      svy *= damp;
      const prevX = shuttleX;
      shuttleX = Math.max(w * 0.1, Math.min(w * 0.9, shuttleX + svx * dt));
      shuttleY = Math.max(top() + 20, Math.min(bot() - 20, shuttleY + svy * dt));

      const speed = Math.hypot(svx, svy);
      cords.forEach((c, i) => {
        const dx = shuttleX - c.x;
        const near = Math.exp(-(dx * dx) / (72 * 72));
        const bow = near * Math.max(-1, Math.min(1, (svx || dx) / 280)) * 46;
        c.vel += (bow - c.offset) * 12 * dt;
        c.vel *= Math.pow(0.9, dt * 60);
        c.offset += c.vel * 60 * dt;

        const crossed = (prevX - c.x) * (shuttleX - c.x) < 0;
        if (crossed) {
          c.side = shuttleX > prevX ? 1 : -1;
          const drive = Math.min(1, speed / 700);
          audio.pluck(0.45 + drive * 0.5, i);
          haptics.tap(8);
          c.vel += c.side * 80;
        }
      });

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x121614, alpha: 1 });

      const beamT = top();
      const beamB = bot();
      g.roundRect(w * 0.08, beamT - 16, w * 0.84, 18, 8);
      g.fill({ color: 0x3a3328, alpha: 1 });
      g.roundRect(w * 0.08, beamB - 2, w * 0.84, 18, 8);
      g.fill({ color: 0x3a3328, alpha: 1 });

      for (const c of cords) {
        const midY = (beamT + beamB) * 0.5;
        g.moveTo(c.x, beamT);
        g.quadraticCurveTo(c.x + c.offset, midY, c.x, beamB);
        g.stroke({ width: 3.4, color: 0xd9c7a2, alpha: 0.9 });
      }

      const sx = shuttleX;
      const sy = shuttleY;
      g.roundRect(sx - 34, sy - 16, 68, 32, 14);
      g.fill({ color: held ? 0xf0e2c4 : 0xcbb992, alpha: 1 });
      g.roundRect(sx - 34, sy - 16, 68, 32, 14);
      g.stroke({ width: 2, color: 0x6a5438, alpha: 0.7 });
      g.circle(sx, sy, 5);
      g.fill({ color: 0x3a2e22, alpha: 0.85 });
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
      layout(true);
    },
    destroy() {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      layer.destroy({ children: true });
    },
  };
}

export const sliderLoom: ExperienceModule = {
  id: "slider-loom",
  collection: "field",
  name: "Slider Loom",
  modality: "Mechanical",
  tagline: "Drag the shuttle — the warp bows, plucks, and springs home.",
  hint: "Grab anywhere and pull the shuttle through the cords. Let go and they ring back.",
  accent: "#8fa894",
  mount,
};
