import { Container, Graphics } from "pixi.js";
import { createHud } from "@/engine/hud";
import { getSharedAudio } from "@/engine/audio";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Pad = {
  x: number;
  y: number;
  r: number;
  bloom: number;
  /** Scale punch, rest 0. Positive expands and squashes slightly wide. */
  punch: number;
  punchV: number;
  /** Wrong-hit or timeout flash */
  miss: number;
  /** Fundamental membrane frequency */
  freq: number;
  /** Visual accent hue shift */
  tint: number;
};

/** One quick beat back to rest — a tap, not a bounce. */
const PUNCH_STIFF = 260;
const PUNCH_DAMP = 18;

/** Looping path across the 4×2 / 2×4 grid — one lit pad at a time. */
const GROOVE = [0, 4, 1, 5, 2, 6, 3, 7];
const WINDOW_START = 1.05;
const WINDOW_MIN = 0.46;

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;
  const shared = getSharedAudio();

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  // Distinct bongo-ish fundamentals across the pad set
  const freqs = [98, 118, 140, 165, 185, 210, 245, 280];
  const tints = [0x6a8f7a, 0x7a9e6a, 0x8fbc6a, 0xa8c478, 0x6a9e8f, 0x5a8f9e, 0x8f8a6a, 0xb0a070];

  const pads: Pad[] = [];
  let padScale = 1;
  const hud = createHud(ctx.host);
  function layout() {
    pads.length = 0;
    // Narrow screens: stack 2×4 so pads stay thumb-sized
    const narrow = w < 560;
    const cols = narrow ? 2 : 4;
    const rows = narrow ? 4 : 2;
    const marginX = narrow ? w * 0.1 : w / (cols + 1);
    const marginY = narrow ? h * 0.12 : h / (rows + 1.2);
    const cellW = narrow ? (w - marginX * 2) / cols : w / (cols + 1);
    const cellH = narrow ? (h - marginY * 2) / rows : h / (rows + 1.2);
    const radius = Math.min(cellW, cellH) * (narrow ? 0.4 : 0.34) * padScale;
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        pads.push({
          x: narrow ? marginX + cellW * (c + 0.5) : cellW * (c + 1),
          y: narrow ? marginY + cellH * (r + 0.5) : cellH * (r + 1.1),
          r: radius,
          bloom: 0,
          punch: 0,
          punchV: 0,
          miss: 0,
          freq: freqs[i],
          tint: tints[i],
        });
        i++;
      }
    }
  }
  hud.slider("Size", 0.7, 1.35, padScale, (v) => {
    padScale = v;
    layout();
  });
  layout();

  let interactive = false;
  let target: number | null = null;
  let phase: "cue" | "gap" = "gap";
  let phaseTime = 0;
  let windowSec = WINDOW_START;
  let streak = 0;
  let step = 0;

  const gapSec = () => Math.max(0.16, windowSec * 0.28);

  function armCue() {
    target = GROOVE[step % GROOVE.length] ?? 0;
    step += 1;
    phase = "cue";
    phaseTime = 0;
  }

  function openGap() {
    phase = "gap";
    phaseTime = 0;
    target = null;
  }

  function resetRound() {
    target = null;
    phase = "gap";
    phaseTime = 0;
    windowSec = WINDOW_START;
    streak = 0;
    step = 0;
    for (const pad of pads) pad.miss = 0;
  }

  function noteMiss(which: number) {
    const pad = pads[which];
    if (pad) pad.miss = 1;
    streak = 0;
    windowSec = Math.min(WINDOW_START, windowSec + 0.1);
    haptics.pattern([0, 12, 46, 16]);
    openGap();
  }

  hud.toggle("Interactive", "Interactive", false, (on) => {
    interactive = on;
    resetRound();
    if (on) armCue();
    void audio.resume();
  });

  const hit = (x: number, y: number) => {
    for (let i = 0; i < pads.length; i++) {
      if (Math.hypot(pads[i].x - x, pads[i].y - y) < pads[i].r) return i;
    }
    return null;
  };

  const kick = (pad: Pad) => {
    pad.punch = 0.15;
    pad.punchV = -0.4;
  };

  const strike = (i: number) => {
    const pad = pads[i];
    pad.bloom = 1;
    kick(pad);
    audio.bongo(pad.freq, 0.75 + (i % 3) * 0.08);
    haptics.pattern([0, 14 + (i % 4) * 3]);
  };

  const succeed = (i: number) => {
    strike(i);
    streak += 1;
    if (streak % 4 === 0) windowSec = Math.max(WINDOW_MIN, windowSec * 0.9);
    openGap();
  };

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    void shared.unlockAndStartPeace();
    const i = hit(e.clientX, e.clientY);
    if (i == null) return;
    if (!interactive) {
      strike(i);
      return;
    }
    if (phase !== "cue" || target == null) return;
    if (i === target) {
      succeed(i);
      return;
    }
    pads[i].miss = 1;
    kick(pads[i]);
    noteMiss(target);
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  el.style.touchAction = "none";

  let time = 0;

  return {
    update(dt: number) {
      time += dt;
      const step = Math.min(dt, 0.034);
      for (const pad of pads) {
        pad.bloom = Math.max(0, pad.bloom - dt * 1.8);
        pad.miss = Math.max(0, pad.miss - dt * 1.7);
        pad.punchV += -pad.punch * PUNCH_STIFF * step;
        pad.punchV *= Math.exp(-step * PUNCH_DAMP);
        pad.punch += pad.punchV * step;
        if (Math.abs(pad.punch) < 0.0015 && Math.abs(pad.punchV) < 0.02) {
          pad.punch = 0;
          pad.punchV = 0;
        }
      }

      if (interactive) {
        phaseTime += dt;
        if (phase === "gap") {
          if (phaseTime >= gapSec()) armCue();
        } else if (target != null && phaseTime >= windowSec) {
          noteMiss(target);
        }
      }

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x121018, alpha: 1 });

      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        const cued = interactive && phase === "cue" && i === target;
        const pulse = cued ? 0.55 + Math.sin(time * 11) * 0.45 : 0;
        const left = cued ? Math.max(0, 1 - phaseTime / windowSec) : 0;
        const breath = 0.5 + Math.sin(time * 1.4 + pad.freq * 0.01) * 0.05;
        const scale = 1 + pad.punch * 1.05;
        const squash = pad.punch * 0.2;
        const rx = Math.max(1, pad.r * scale * (1 + squash));
        const ry = Math.max(1, pad.r * scale * (1 - squash * 0.88));
        const halo = cued ? 1.55 + pulse * 0.35 : 1.35;
        const oval = (mul: number) => {
          const ex = rx * mul;
          const ey = ry * mul;
          if (Math.abs(ex - ey) < 0.6) g.circle(pad.x, pad.y, (ex + ey) * 0.5);
          else g.ellipse(pad.x, pad.y, ex, ey);
        };
        oval(halo);
        g.fill({
          color: cued ? 0xfff1a8 : pad.tint,
          alpha: cued ? 0.22 + pulse * 0.4 : 0.12 + pad.bloom * 0.35,
        });
        oval(1);
        g.fill({ color: cued ? 0xf4efb0 : 0x2a3830, alpha: cued ? 0.96 : 0.95 });
        if (pad.miss > 0.04) {
          oval(1);
          g.fill({ color: 0xd45548, alpha: pad.miss * 0.82 });
        }
        oval(1);
        g.stroke({
          width: cued ? 4 : 2.5,
          color: cued ? 0xfff6c2 : pad.miss > 0.04 ? 0xff8a78 : pad.tint,
          alpha: cued ? 0.78 + pulse * 0.22 : pad.miss > 0.04 ? pad.miss : (0.4 + pad.bloom * 0.55) * breath,
        });
        if (cued) {
          oval(1.08 + left * 0.72);
          g.stroke({ width: 3, color: 0xfff6c2, alpha: 0.55 + left * 0.4 });
          oval(0.38 + pulse * 0.1);
          g.fill({ color: 0xfffbe6, alpha: 0.62 + pulse * 0.34 });
        }
        if (pad.bloom > 0.05) {
          oval(1.15 + (1 - pad.bloom) * 0.4);
          g.stroke({ width: 2, color: 0xc5e1a5, alpha: pad.bloom * 0.65 });
        }
      }
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
      layout();
    },
    destroy() {
      hud.destroy();
      el.removeEventListener("pointerdown", onDown);
      layer.destroy({ children: true });
    },
  };
}

export const pulsePads: ExperienceModule = {
  id: "pulse-pads",
  collection: "studio",
  name: "Pulse Pads",
  modality: "Rhythm",
  tagline: "Tap pads — each hits a distinct bongo tone.",
  hint: "Tap any pad. Each has its own bongo pitch.",
  accent: "#8fbc8f",
  mount,
};
