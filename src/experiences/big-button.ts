import { Container, Graphics, Text } from "pixi.js";
import { createHud } from "@/engine/hud";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Verdict = "perfect" | "hit" | "miss";

const FILL_TIME = 1.9;
const SWEET_LO = 0.78;
const SWEET_HI = 0.95;
const PERFECT_LO = 0.84;
const PERFECT_HI = 0.9;

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  let press = 0;
  let target = 0;
  let bloom = 0;
  let held = false;

  let size = 1;
  let interactive = false;
  let meter = 0;
  let running = false;
  let rest = 0;
  let judgeLife = 0;
  let judgeKind: Verdict = "hit";
  let flash = 0;

  const hud = createHud(ctx.host);
  hud.slider("Size", 0.65, 1.45, size, (v) => {
    size = v;
  });
  hud.toggle("Interactive", "Interactive", false, (on) => {
    interactive = on;
    meter = 0;
    running = false;
    rest = on ? 0.4 : 0;
    judgeLife = 0;
    flash = 0;
    banner.visible = false;
    void audio.resume();
  });

  const banner = new Text({
    text: "",
    style: {
      fontFamily: "system-ui, sans-serif",
      fontSize: 22,
      fill: 0xe7e2d6,
      fontWeight: "700",
    },
  });
  banner.anchor.set(0.5);
  banner.visible = false;
  layer.addChild(banner);

  const radius = () => Math.min(w, h) * 0.3 * size;

  const mark = (label: string, kind: Verdict) => {
    banner.text = label;
    judgeKind = kind;
    judgeLife = 1;
    flash = kind === "miss" ? -1 : 1;
    running = false;
    rest = 0.72;
  };

  const hit = (x: number, y: number) => {
    return Math.hypot(x - w * 0.5, y - h * 0.5) < radius() * 1.15;
  };

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    if (!hit(e.clientX, e.clientY)) return;
    held = true;
    target = 1;
    bloom = 1;
    audio.buttonPress("down", 0.95);
    haptics.pattern([0, 22, 40, 12]);
    if (interactive && running) {
      if (meter >= PERFECT_LO && meter <= PERFECT_HI) mark("Perfect", "perfect");
      else if (meter >= SWEET_LO && meter <= SWEET_HI) mark("Hit", "hit");
      else mark(meter < SWEET_LO ? "Early" : "Late", "miss");
    }
  };
  const onUp = () => {
    if (!held) return;
    held = false;
    target = 0;
    audio.buttonPress("up", 0.9);
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  return {
    update(dt: number) {
      const rate = target > press ? 20 : 13;
      press += (target - press) * Math.min(1, dt * rate);
      bloom = Math.max(0, bloom - dt * 1.6);
      judgeLife = Math.max(0, judgeLife - dt * 1.15);
      flash *= Math.exp(-dt * 3.2);

      if (interactive) {
        if (rest > 0) {
          rest = Math.max(0, rest - dt);
          if (rest === 0) {
            meter = 0;
            running = true;
          }
        } else if (running) {
          meter += dt / FILL_TIME;
          if (meter > SWEET_HI + 0.05) mark("Miss", "miss");
        }
      }

      const cx = w * 0.5;
      const cy = h * 0.5;
      const r = radius();
      // Scale toward center + slight sink — classic arcade mush
      const s = 1 - press * 0.18;
      const sink = press * r * 0.06;
      const br = r * s;
      const side = Math.max(3, r * 0.11 * (1 - press * 0.85));
      const topY = cy + sink;

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x121018, alpha: 1 });

      // Fixed housing
      g.circle(cx, cy, r * 1.22);
      g.fill({ color: 0x1a2220, alpha: 1 });
      g.circle(cx, cy, r * 1.22);
      g.stroke({ width: 3, color: 0x343e3a, alpha: 1 });

      // Recessed well
      g.circle(cx, cy, r * 1.04);
      g.fill({ color: 0x080a0c, alpha: 1 });

      // Button side wall (single band — thickness cue)
      g.circle(cx, topY + side * 0.65, br);
      g.fill({ color: 0x8a3830, alpha: 1 });

      // Button top face (scales)
      g.circle(cx, topY, br);
      g.fill({ color: press > 0.55 ? 0xb04e42 : 0xc45a4a, alpha: 1 });

      // Specular — compresses with scale
      g.circle(cx - br * 0.22, topY - br * 0.2, br * 0.42);
      g.fill({ color: 0xffffff, alpha: 0.2 * (1 - press * 0.5) });

      // Rim lip
      g.circle(cx, topY, br);
      g.stroke({ width: 2.5, color: 0xe07068, alpha: 0.5 + (1 - press) * 0.25 });

      // Inner groove
      g.circle(cx, topY, br * 0.7);
      g.stroke({ width: 2, color: 0x8a3028, alpha: 0.35 });

      // Pressed: darken rim into the well
      if (press > 0.08) {
        g.circle(cx, topY, br);
        g.stroke({ width: 5 + press * 10, color: 0x000000, alpha: press * 0.35 });
      }

      if (bloom > 0.02) {
        g.circle(cx, topY, br * (1.05 + (1 - bloom) * 0.2));
        g.fill({ color: 0xffa090, alpha: bloom * 0.1 });
      }

      if (interactive) {
        const inZone = running && meter >= SWEET_LO && meter <= SWEET_HI;
        const meterH = Math.min(h * 0.36, Math.max(96, r * 1.85));
        const meterW = 16;
        const housing = r * 1.22;
        let vertical = true;
        let mx = cx - housing - meterW - 18;
        let my = cy - meterH / 2;
        if (mx < 12) {
          vertical = false;
          mx = cx - Math.min(w * 0.62, r * 2.15) / 2;
          my = Math.max(36, cy - housing - 34);
        }
        const span = vertical ? meterH : Math.min(w * 0.62, r * 2.15);
        const trackW = vertical ? meterW : span;
        const trackH = vertical ? meterH : meterW;

        g.roundRect(mx, my, trackW, trackH, 8);
        g.fill({ color: 0x141c1a, alpha: 1 });
        g.roundRect(mx, my, trackW, trackH, 8);
        g.stroke({ width: 2, color: 0x3a4642, alpha: 1 });

        const z0 = SWEET_LO;
        const z1 = SWEET_HI;
        if (vertical) {
          const zy1 = my + meterH * (1 - z0);
          const zy0 = my + meterH * (1 - z1);
          g.roundRect(mx - 3, zy0, meterW + 6, Math.max(6, zy1 - zy0), 5);
          g.fill({ color: 0xe4d19a, alpha: inZone ? 0.95 : 0.55 });
          const fillH = Math.max(0, Math.min(1, meter)) * meterH;
          if (fillH > 2) {
            g.roundRect(mx + 3, my + meterH - fillH, meterW - 6, fillH - 2, 4);
            g.fill({ color: inZone ? 0xfff4c8 : 0xd06050, alpha: 1 });
          }
        } else {
          const zx0 = mx + span * z0;
          const zw = span * (z1 - z0);
          g.roundRect(zx0, my - 3, zw, meterW + 6, 5);
          g.fill({ color: 0xe4d19a, alpha: inZone ? 0.95 : 0.55 });
          const fillW = Math.max(0, Math.min(1, meter)) * span;
          if (fillW > 2) {
            g.roundRect(mx + 2, my + 3, Math.max(2, fillW - 4), meterW - 6, 4);
            g.fill({ color: inZone ? 0xfff4c8 : 0xd06050, alpha: 1 });
          }
        }

        if (inZone) {
          g.circle(cx, topY, br);
          g.stroke({ width: 4, color: 0xf0e2b0, alpha: 0.9 });
        }

        if (flash > 0.03) {
          g.circle(cx, topY, br * (1.12 + (1 - flash) * 0.22));
          g.stroke({ width: 4, color: 0xf0e2b0, alpha: flash * 0.95 });
        } else if (flash < -0.03) {
          const mag = -flash;
          g.circle(cx, topY, br * (1.08 + (1 - mag) * 0.16));
          g.stroke({ width: 4, color: 0xc45a4a, alpha: mag * 0.8 });
        }

        banner.visible = judgeLife > 0.04;
        banner.alpha = judgeLife;
        banner.position.set(cx, Math.max(22, my - 22));
        banner.style.fill =
          judgeKind === "miss" ? 0xe7a097 : judgeKind === "perfect" ? 0xf0e2b0 : 0xd7e6d2;
      } else {
        banner.visible = false;
      }
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    destroy() {
      hud.destroy();
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      layer.destroy({ children: true });
    },
  };
}

export const bigButton: ExperienceModule = {
  id: "big-button",
  collection: "field",
  name: "Big Button",
  modality: "Press",
  tagline: "One giant round press — deep thunk, soft rebound.",
  hint: "Press the big red button.",
  accent: "#c45a4a",
  mount,
};
