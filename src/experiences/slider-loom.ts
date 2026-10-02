import { Container, Graphics } from "pixi.js";
import { createHud } from "@/engine/hud";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Cord = {
  x: number;
  offset: number;
  vel: number;
  side: number;
  cool: number;
};

type Mote = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  kind: "note" | "spark";
  rot: number;
  spin: number;
  size: number;
  color: number;
};

/** Bow slider: low is a taut instrument string, high is a loose cord. */
const BOW_MIN = 12;
const BOW_MAX = 90;
const BOW_DEFAULT = 14;

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
  const motes: Mote[] = [];

  function layout(keepMotion = false) {
    const n = 11;
    const left = w * 0.14;
    const right = w * 0.86;
    const prev = keepMotion
      ? cords.map((c) => ({ offset: c.offset, vel: c.vel, side: c.side, cool: c.cool }))
      : [];
    cords.length = 0;
    for (let i = 0; i < n; i++) {
      cords.push({
        x: left + ((right - left) * i) / (n - 1),
        offset: prev[i]?.offset ?? 0,
        vel: prev[i]?.vel ?? 0,
        side: prev[i]?.side ?? 0,
        cool: prev[i]?.cool ?? 0,
      });
    }
    if (!keepMotion) {
      shuttleX = w * 0.5;
      shuttleY = h * 0.5;
    }
  }
  let bowAmount = BOW_DEFAULT;
  const hud = createHud(ctx.host);
  hud.slider("Bow", BOW_MIN, BOW_MAX, bowAmount, (v) => {
    bowAmount = v;
  });
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

  /** 0 = taut instrument, 1 = loose bow at the top of the slider. */
  const slack = () => (bowAmount - BOW_MIN) / (BOW_MAX - BOW_MIN);

  function spawnPluck(x: number, y: number, dir: number, drive: number) {
    const noteLife = 0.48 + Math.random() * 0.16;
    motes.push({
      kind: "note",
      x,
      y: y - 8,
      vx: dir * (16 + drive * 28),
      vy: -(42 + Math.random() * 30 + drive * 16),
      life: noteLife,
      max: noteLife,
      rot: dir * 0.2,
      spin: dir * (0.4 + Math.random() * 0.5),
      size: 15 + drive * 5,
      color: Math.random() < 0.55 ? 0xf6ead0 : 0xe4c98a,
    });
    const count = 2 + (drive > 0.55 ? 2 : drive > 0.25 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const life = 0.14 + Math.random() * 0.16;
      const spread = (Math.random() - 0.35) * 1.15;
      const speed = 40 + Math.random() * 55 + drive * 70;
      motes.push({
        kind: "spark",
        x: x + (Math.random() - 0.5) * 5,
        y: y + (Math.random() - 0.5) * 7,
        vx: Math.cos(spread) * speed * dir,
        vy: Math.sin(spread) * speed * 0.45 - 18 - Math.random() * 16,
        life,
        max: life,
        rot: 0,
        spin: 0,
        size: 1.2 + Math.random() * 1.3,
        color: i % 2 === 0 ? 0xfff4d4 : 0xe8c56a,
      });
    }
    if (motes.length > 36) motes.splice(0, motes.length - 36);
  }

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
      const give = slack();
      const spring = 34 - give * 22;
      const cordDamp = Math.pow(0.76 + give * 0.14, dt * 60);
      cords.forEach((c, i) => {
        c.cool = Math.max(0, c.cool - dt);
        const dx = shuttleX - c.x;
        const near = Math.exp(-(dx * dx) / (72 * 72));
        const bow = near * Math.max(-1, Math.min(1, (svx || dx) / 280)) * bowAmount;
        c.vel += (bow - c.offset) * spring * dt;
        c.vel *= cordDamp;
        c.offset += c.vel * 60 * dt;

        const crossed = (prevX - c.x) * (shuttleX - c.x) < 0;
        if (crossed) {
          c.side = shuttleX > prevX ? 1 : -1;
          const drive = Math.min(1, speed / 700);
          audio.pluck(0.45 + drive * 0.5, i);
          haptics.tap(8);
          c.vel += c.side * (14 + give * 74) * (0.65 + drive * 0.35);
          if (c.cool <= 0 && speed > 50) {
            c.cool = 0.06;
            const span = bot() - top();
            const t = Math.max(0, Math.min(1, (shuttleY - top()) / Math.max(1, span)));
            const contactX = c.x + 2 * (1 - t) * t * c.offset;
            spawnPluck(contactX, shuttleY, c.side, drive);
          }
        }
      });

      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i];
        m.life -= dt;
        if (m.life <= 0) {
          motes.splice(i, 1);
          continue;
        }
        m.vy += (m.kind === "note" ? 22 : 70) * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.vx *= Math.exp(-1.8 * dt);
        m.rot += m.spin * dt;
      }

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

      for (const m of motes) {
        const fade = Math.max(0, m.life / m.max);
        if (m.kind === "spark") {
          g.moveTo(m.x, m.y);
          g.lineTo(m.x - m.vx * 0.022, m.y - m.vy * 0.022);
          g.stroke({
            width: Math.max(1, m.size * (0.45 + fade)),
            color: m.color,
            alpha: fade,
            cap: "round",
          });
          g.circle(m.x, m.y, m.size * (0.35 + fade * 0.4));
          g.fill({ color: 0xfff8ea, alpha: fade * 0.9 });
        } else {
          drawNote(g, m.x, m.y, m.rot, m.size * (0.85 + fade * 0.2), m.color, 0.25 + fade * 0.75);
        }
      }
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
      layout(true);
    },
    destroy() {
      hud.destroy();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      layer.destroy({ children: true });
    },
  };
}

function drawNote(
  g: Graphics,
  x: number,
  y: number,
  rot: number,
  size: number,
  color: number,
  alpha: number,
) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const pt = (lx: number, ly: number) => ({
    x: x + (lx * c - ly * s) * size,
    y: y + (lx * s + ly * c) * size,
  });
  const head0 = pt(0.36, 0.18);
  g.moveTo(head0.x, head0.y);
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p = pt(Math.cos(a) * 0.36, 0.18 + Math.sin(a) * 0.22);
    g.lineTo(p.x, p.y);
  }
  g.fill({ color, alpha });
  const stemBase = pt(0.28, 0.04);
  const stemTip = pt(0.28, -0.88);
  g.moveTo(stemBase.x, stemBase.y);
  g.lineTo(stemTip.x, stemTip.y);
  g.stroke({ width: Math.max(1.15, size * 0.1), color, alpha, cap: "round" });
  const flag0 = pt(0.28, -0.88);
  const flag1 = pt(0.72, -0.46);
  const flag2 = pt(0.38, -0.28);
  g.moveTo(flag0.x, flag0.y);
  g.quadraticCurveTo(flag1.x, flag1.y, flag2.x, flag2.y);
  g.stroke({ width: Math.max(1.1, size * 0.09), color, alpha, cap: "round" });
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
