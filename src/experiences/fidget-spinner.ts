import { Container, Graphics } from "pixi.js";
import { hslToRgb } from "@/engine/color";
import { createHud } from "@/engine/hud";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

/** Colour sparks start here and are fully on at top speed (rad/s). */
const COLOR_IN = 13;
const COLOR_TOP = 22;

/** A point of space rushing toward the camera, then past the rim. */
type Mote = {
  ang: number;
  /** Distance off the flight axis. Larger values pass wider of the spinner. */
  lateral: number;
  /** 1 is far ahead, near 0 has already flown past. */
  depth: number;
  wind: boolean;
  bright: number;
};

function makeMote(wind: boolean, scattered: boolean): Mote {
  return {
    ang: Math.random() * Math.PI * 2,
    lateral: wind ? 0.42 + Math.random() * 0.7 : 0.12 + Math.random() * 0.95,
    depth: scattered ? 0.08 + Math.random() * 0.9 : 0.78 + Math.random() * 0.22,
    wind,
    bright: 0.45 + Math.random() * 0.55,
  };
}

function recycle(m: Mote) {
  m.ang = Math.random() * Math.PI * 2;
  m.lateral = m.wind ? 0.45 + Math.random() * 0.68 : 0.1 + Math.random() * 0.95;
  m.depth = 0.82 + Math.random() * 0.18;
  m.bright = 0.45 + Math.random() * 0.55;
}

/** A bright hue thrown outward only while the spinner is near top speed. */
type Spark = {
  ang: number;
  lateral: number;
  depth: number;
  hue: number;
  /** 0–1. Lower seeds appear first as spin climbs toward top speed. */
  seed: number;
};

function makeSpark(scattered: boolean): Spark {
  return {
    ang: Math.random() * Math.PI * 2,
    lateral: 0.5 + Math.random() * 0.75,
    depth: scattered ? 0.12 + Math.random() * 0.8 : 0.7 + Math.random() * 0.3,
    hue: Math.random(),
    seed: Math.random(),
  };
}

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  let angle = 0;
  let omega = 0;
  let dragging = false;
  let lastA = 0;
  let lastT = 0;
  let clickPhase = 0;
  let held = false;
  /** Smoothed 0–1 spin, so a noisy drag still reads as one flight. */
  let flight = 0;

  const motes: Mote[] = [];
  for (let i = 0; i < 96; i++) motes.push(makeMote(false, true));
  for (let i = 0; i < 36; i++) motes.push(makeMote(true, true));

  const sparks: Spark[] = [];
  for (let i = 0; i < 84; i++) sparks.push(makeSpark(true));

  const radius = () => Math.min(w, h) * 0.28;

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    const cx = w * 0.5;
    const cy = h * 0.5;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    if (Math.hypot(dx, dy) > radius() * 1.35) return;
    dragging = true;
    held = true;
    lastA = Math.atan2(dy, dx);
    lastT = performance.now();
    omega *= 0.3;
    haptics.tap(6);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const a = Math.atan2(e.clientY - cy, e.clientX - cx);
    let da = a - lastA;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    const now = performance.now();
    const dt = Math.max(0.008, (now - lastT) / 1000);
    omega = da / dt;
    angle += da;
    lastA = a;
    lastT = now;
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    held = false;
    if (Math.abs(omega) > 2) {
      audio.whoosh(Math.min(1, Math.abs(omega) / 25));
      haptics.pattern([0, 10]);
    }
  };

  let coast = 0.55;
  const hud = createHud(ctx.host);
  hud.slider("Coast", 0.15, 1.4, coast, (v) => {
    coast = 1.55 - v;
  });

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  return {
    update(dt: number) {
      if (!held) {
        // Friction
        omega *= Math.exp(-dt * coast);
        if (Math.abs(omega) < 0.15) omega = 0;
        angle += omega * dt;
      }

      clickPhase += Math.abs(omega) * dt;
      if (clickPhase > 0.55) {
        clickPhase = 0;
        if (Math.abs(omega) > 1.5) {
          audio.click(0.18, 1.4 + Math.min(0.4, Math.abs(omega) * 0.02));
        }
      }

      const drive = Math.min(1, Math.abs(omega) / 16);
      flight += (drive - flight) * (1 - Math.exp(-dt * 8));

      const cx = w * 0.5;
      const cy = h * 0.5;
      const r = radius();
      const focus = r * 0.7;
      const half = Math.hypot(w, h) * 0.52;
      const crawl = 0.016 + flight * 0.28 + flight * flight * 0.95;

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x101418, alpha: 1 });

      for (const m of motes) {
        const pace = m.wind ? 1.35 : 0.55 + m.lateral * 0.6;
        m.depth -= dt * crawl * pace;
        const screenR = (m.lateral * focus) / Math.max(0.035, m.depth);
        if (m.depth < 0.04 || screenR > half * 1.2) recycle(m);
      }

      // Drawn first so the spinner stays in front and easy to grab.
      const body = r * 1.02;
      for (const m of motes) {
        const screenR = (m.lateral * focus) / Math.max(0.035, m.depth);
        if (screenR < r * 0.32 || screenR > half) continue;

        const cos = Math.cos(m.ang);
        const sin = Math.sin(m.ang);
        const x = cx + cos * screenR;
        const y = cy + sin * screenR;
        const emerge = Math.min(1, Math.max(0, (screenR - r * 0.4) / (r * 0.55)));
        const rim = 1 - Math.min(1, Math.max(0, (screenR - half * 0.78) / (half * 0.22)));
        const presence = emerge * rim * m.bright;

        if (m.wind) {
          if (flight < 0.04 || screenR < body) continue;
          const streak = Math.min(screenR - body, r * (0.12 + flight * 0.85) * (0.55 + m.lateral));
          if (streak < 1.5) continue;
          const tail = screenR - streak;
          g.moveTo(cx + cos * tail, cy + sin * tail);
          g.lineTo(x, y);
          g.stroke({
            width: 0.7 + flight * 1.15,
            color: 0x9aafc2,
            alpha: Math.min(0.42, presence * flight * 0.5),
            cap: "round",
          });
          continue;
        }

        const size = 0.55 + (1 - m.depth) * (0.9 + flight * 1.8) * (0.5 + m.bright * 0.5);
        const streak = size * (1.2 + flight * 22) * Math.min(1.2, 0.35 + m.lateral);
        if (flight > 0.08 && streak > 2) {
          const tail = Math.max(r * 0.28, screenR - streak);
          if (tail < screenR - 1) {
            g.moveTo(cx + cos * tail, cy + sin * tail);
            g.lineTo(x, y);
            g.stroke({
              width: Math.max(0.5, size * 0.34),
              color: 0xc5d4e2,
              alpha: Math.min(0.5, presence * (0.12 + flight * 0.55)),
              cap: "round",
            });
          }
        }
        g.circle(x, y, size);
        g.fill({
          color: m.bright > 0.82 ? 0xe7eef4 : 0xc5d3e0,
          alpha: Math.min(0.8, presence * (0.18 + flight * 0.7)),
        });
      }

      const spin = Math.abs(omega);
      const chroma = spin <= COLOR_IN ? 0 : Math.min(1, (spin - COLOR_IN) / (COLOR_TOP - COLOR_IN));
      if (chroma > 0) {
        const rush = 0.9 + chroma * 1.7;
        for (const s of sparks) {
          s.depth -= dt * rush * (0.7 + s.lateral * 0.4);
          const reach = (s.lateral * focus) / Math.max(0.04, s.depth);
          if (s.depth < 0.045 || reach > half * 1.15) {
            const next = makeSpark(false);
            s.ang = next.ang;
            s.lateral = next.lateral;
            s.depth = next.depth;
            s.hue = next.hue;
            s.seed = next.seed;
          }
        }
        for (const s of sparks) {
          if (s.seed > chroma) continue;
          const screenR = (s.lateral * focus) / Math.max(0.04, s.depth);
          if (screenR < body || screenR > half) continue;
          const cos = Math.cos(s.ang);
          const sin = Math.sin(s.ang);
          const x = cx + cos * screenR;
          const y = cy + sin * screenR;
          const rim = 1 - Math.min(1, Math.max(0, (screenR - half * 0.8) / (half * 0.2)));
          const streak = Math.min(screenR - body, r * (0.16 + chroma * 1.25) * (0.45 + s.lateral));
          const color = hslToRgb(s.hue, 0.78, 0.62);
          const alpha = Math.min(0.88, rim * (0.34 + chroma * 0.58));
          if (streak > 2) {
            const tail = screenR - streak;
            g.moveTo(cx + cos * tail, cy + sin * tail);
            g.lineTo(x, y);
            g.stroke({ width: 1.1 + chroma * 1.5, color, alpha, cap: "round" });
          }
          g.circle(x, y, 1.1 + chroma * 1.5);
          g.fill({ color, alpha: Math.min(0.95, alpha + 0.12) });
        }
      }

      // Soft motion blur ring
      if (Math.abs(omega) > 4) {
        g.circle(cx, cy, r * 1.05);
        g.stroke({ width: 10, color: 0x6a8aaa, alpha: Math.min(0.35, Math.abs(omega) * 0.015) });
      }

      // Bearing hub
      g.circle(cx, cy, r * 0.22);
      g.fill({ color: 0x3a4450, alpha: 1 });
      g.circle(cx, cy, r * 0.12);
      g.fill({ color: 0x1a2028, alpha: 1 });
      g.circle(cx, cy, r * 0.05);
      g.fill({ color: 0xc0c8d0, alpha: 0.8 });

      // Three arms + weights
      for (let i = 0; i < 3; i++) {
        const a = angle + (i * Math.PI * 2) / 3;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const x0 = cx + cos * r * 0.2;
        const y0 = cy + sin * r * 0.2;
        const x1 = cx + cos * r * 0.72;
        const y1 = cy + sin * r * 0.72;

        g.moveTo(x0 + sin * 8, y0 - cos * 8);
        g.lineTo(x1 + sin * 10, y1 - cos * 10);
        g.lineTo(x1 - sin * 10, y1 + cos * 10);
        g.lineTo(x0 - sin * 8, y0 + cos * 8);
        g.closePath();
        g.fill({ color: 0x5a7a9a, alpha: 0.95 });

        g.circle(x1, y1, r * 0.28);
        g.fill({ color: 0x7a9aba, alpha: 1 });
        g.circle(x1 - cos * r * 0.08 - sin * r * 0.06, y1 - sin * r * 0.08 + cos * r * 0.06, r * 0.1);
        g.fill({ color: 0xffffff, alpha: 0.2 });
        g.circle(x1, y1, r * 0.1);
        g.fill({ color: 0x2a3440, alpha: 0.85 });
      }
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    destroy() {
      hud.destroy();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      layer.destroy({ children: true });
    },
  };
}

export const fidgetSpinner: ExperienceModule = {
  id: "fidget-spinner",
  collection: "studio",
  name: "Fidget Spinner",
  modality: "Fidget",
  tagline: "Flick the arms — bearings hum, then coast to still.",
  hint: "Drag to spin. Flick hard for a long coast.",
  accent: "#7a9aba",
  mount,
};
