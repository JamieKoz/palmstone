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

  let extended = false;
  let press = 0; // 0 idle → 1 fully depressed
  let tipBloom = 0;
  let angle = -0.35;
  let holding = false;
  let armed = false; // pointer down on clicker/tip

  const penLen = () => Math.min(w, h) * 0.72;
  const penThick = () => Math.min(w, h) * 0.055;

  const tipHit = (x: number, y: number) => {
    const cx = w * 0.5;
    const cy = h * 0.52;
    const len = penLen();
    const tipX = cx + Math.cos(angle) * (len * 0.42);
    const tipY = cy + Math.sin(angle) * (len * 0.42);
    return Math.hypot(x - tipX, y - tipY) < penThick() * 2.4;
  };

  const clickerHit = (x: number, y: number) => {
    const cx = w * 0.5;
    const cy = h * 0.52;
    const len = penLen();
    const bx = cx - Math.cos(angle) * (len * 0.38);
    const by = cy - Math.sin(angle) * (len * 0.38);
    return Math.hypot(x - bx, y - by) < penThick() * 2.6;
  };

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    if (!(tipHit(e.clientX, e.clientY) || clickerHit(e.clientX, e.clientY))) return;
    armed = true;
    holding = true;
    audio.penClick("down", 0.8);
    haptics.tap(10);
  };

  const onUp = () => {
    if (!armed) return;
    armed = false;
    holding = false;
    extended = !extended;
    tipBloom = 1;
    audio.penClick("up", 0.85);
    haptics.pattern([0, 14, 28, 8]);
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  return {
    update(dt: number) {
      const target = holding ? 1 : 0;
      press += (target - press) * Math.min(1, dt * 22);
      tipBloom = Math.max(0, tipBloom - dt * 2.2);
      angle += Math.sin(performance.now() * 0.0007) * 0.00015;

      const cx = w * 0.5;
      const cy = h * 0.52;
      const len = penLen();
      const thick = penThick();
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const hx = -sin;
      const hy = cos;

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x121418, alpha: 1 });

      // Soft desk shadow
      g.ellipse(cx + 8, cy + len * 0.18, len * 0.42, thick * 1.6);
      g.fill({ color: 0x000000, alpha: 0.28 });

      const drawCapsule = (
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        r: number,
        color: number,
        alpha = 1,
      ) => {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const d = Math.hypot(dx, dy) || 1;
        const nx = -dy / d;
        const ny = dx / d;
        g.moveTo(x0 + nx * r, y0 + ny * r);
        g.lineTo(x1 + nx * r, y1 + ny * r);
        g.arc(x1, y1, r, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
        g.lineTo(x0 - nx * r, y0 - ny * r);
        g.arc(x0, y0, r, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
        g.fill({ color, alpha });
      };

      const tipExtend = extended ? thick * 1.6 : thick * 0.35;
      const tipX = cx + cos * (len * 0.42 + tipExtend * 0.5);
      const tipY = cy + sin * (len * 0.42 + tipExtend * 0.5);
      const body0x = cx - cos * len * 0.4;
      const body0y = cy - sin * len * 0.4;
      const body1x = cx + cos * len * 0.34;
      const body1y = cy + sin * len * 0.34;

      drawCapsule(body0x, body0y, body1x, body1y, thick, 0x2a4a6e);
      drawCapsule(
        body0x + cos * thick * 0.2 + hx * thick * 0.25,
        body0y + sin * thick * 0.2 + hy * thick * 0.25,
        body1x - cos * thick + hx * thick * 0.25,
        body1y - sin * thick + hy * thick * 0.25,
        thick * 0.35,
        0x4a7aaa,
        0.55,
      );

      // Grip
      drawCapsule(
        cx - cos * len * 0.08,
        cy - sin * len * 0.08,
        cx + cos * len * 0.18,
        cy + sin * len * 0.18,
        thick * 1.05,
        0x1a2838,
      );

      // Tip cone
      const coneBaseX = cx + cos * len * 0.34;
      const coneBaseY = cy + sin * len * 0.34;
      g.moveTo(coneBaseX + hx * thick * 0.85, coneBaseY + hy * thick * 0.85);
      g.lineTo(tipX, tipY);
      g.lineTo(coneBaseX - hx * thick * 0.85, coneBaseY - hy * thick * 0.85);
      g.fill({ color: 0xc4b49a, alpha: 0.95 });
      g.circle(tipX, tipY, thick * (0.22 + tipBloom * 0.15));
      g.fill({ color: 0x1a1a1a, alpha: 0.9 });

      // Clicker button — sinks in while held
      const clickPush = press * thick * 0.85;
      const bx = body0x - cos * (thick * 0.9 - clickPush);
      const by = body0y - sin * (thick * 0.9 - clickPush);
      g.circle(bx, by, thick * 0.55);
      g.fill({ color: 0xd4c4a8, alpha: 1 });
      g.circle(bx - cos * thick * 0.15, by - sin * thick * 0.15, thick * 0.28);
      g.fill({ color: 0xf0e6d2, alpha: 0.7 });

      if (tipBloom > 0.05) {
        g.circle(tipX, tipY, thick * (1.2 + (1 - tipBloom)));
        g.stroke({ width: 2, color: 0xa8c8e0, alpha: tipBloom * 0.55 });
      }
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    destroy() {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      layer.destroy({ children: true });
    },
  };
}

export const penClicker: ExperienceModule = {
  id: "pen-clicker",
  collection: "field",
  name: "Pen Clicker",
  modality: "Click",
  tagline: "Retractable click — tip out, tip in, again.",
  hint: "Press and hold the clicker, then release.",
  accent: "#6a8fad",
  mount,
};
