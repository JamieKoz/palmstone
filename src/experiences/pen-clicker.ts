import { Container, Graphics } from "pixi.js";
import { createHud } from "@/engine/hud";
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
  let pressVel = 0;
  let tipPos = 0; // 0 retracted → 1 extended, with a short overshoot
  let tipFrom = 0;
  let tipTo = 0;
  let snapT = 1;
  let flash = 0;
  let shake = 0;
  let holding = false;
  let armed = false; // pointer down on clicker/tip

  // Tip points down. A small lean keeps the clip readable while the pen stays upright.
  const baseAngle = Math.PI / 2 - 0.16;
  const penAngle = () => baseAngle + Math.sin(performance.now() * 0.00065) * 0.01;

  const penLen = () => Math.min(w, h) * 0.64;
  const penThick = () => Math.min(w, h) * 0.046;

  const pose = () => {
    const len = penLen();
    const thick = penThick();
    const angle = penAngle();
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      len,
      thick,
      cos,
      sin,
      cx: w * 0.5,
      cy: h * 0.53,
    };
  };

  const tipHit = (x: number, y: number) => {
    const { len, thick, cos, sin, cx, cy } = pose();
    const nose = len * 0.4;
    const out = len * 0.4 + thick * 2.5;
    const nearNose = Math.hypot(x - (cx + cos * nose), y - (cy + sin * nose)) < thick * 2.3;
    const nearPoint = Math.hypot(x - (cx + cos * out), y - (cy + sin * out)) < thick * 2.1;
    return nearNose || nearPoint;
  };

  const clickerHit = (x: number, y: number) => {
    const { len, thick, cos, sin, cx, cy } = pose();
    const bx = cx - cos * (len * 0.5);
    const by = cy - sin * (len * 0.5);
    return Math.hypot(x - bx, y - by) < thick * 3.8;
  };

  const el = ctx.app.canvas;

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (!(tipHit(x, y) || clickerHit(x, y))) return;
    armed = true;
    holding = true;
    audio.penClick("down", 0.8);
    haptics.tap(10);
  };

  const onUp = () => {
    if (!armed) return;
    armed = false;
    holding = false;
    tipFrom = tipPos;
    extended = !extended;
    tipTo = extended ? 1 : 0;
    snapT = 0;
    flash = 1;
    shake = 1;
    audio.penClick("up", 0.85);
    haptics.pattern([0, 14, 28, 8]);
  };

  let clickRate = 22;
  const hud = createHud(ctx.host);
  hud.slider("Click", 8, 40, clickRate, (v) => {
    clickRate = v;
  });

  el.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  const easeOutBack = (x: number) => {
    const c1 = 1.85;
    const c3 = c1 + 1;
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
  };

  return {
    update(dt: number) {
      const step = Math.min(dt, 0.05);
      const target = holding ? 1 : 0;
      const stiffness = (clickRate * 1.35) ** 2;
      const damping = 2 * 0.48 * Math.sqrt(stiffness);
      pressVel += (target - press) * stiffness * step;
      pressVel *= Math.exp(-damping * step);
      press += pressVel * step;
      if (press > 1.08) {
        press = 1.08;
        pressVel *= 0.2;
      } else if (press < -0.34) {
        press = -0.34;
        pressVel *= 0.2;
      }

      if (snapT < 1) {
        snapT = Math.min(1, snapT + step * 6.4);
        tipPos = tipFrom + (tipTo - tipFrom) * easeOutBack(snapT);
      }
      flash = Math.max(0, flash - step * 3.4);
      shake *= Math.exp(-step * 11);

      const len = penLen();
      const r = penThick();
      const wobble = Math.sin((1 - Math.min(shake, 1)) * Math.PI * 3) * shake * 0.02;
      const drawAngle = penAngle() + wobble;
      const cos = Math.cos(drawAngle);
      const sin = Math.sin(drawAngle);
      const hx = -sin;
      const hy = cos;
      const kick = Math.sin(Math.min(shake, 1) * Math.PI) * r * 0.16;
      const cx = w * 0.5 - cos * kick;
      const cy = h * 0.53 - sin * kick;

      const pt = (t: number, p: number) => ({
        x: cx + cos * t + hx * p,
        y: cy + sin * t + hy * p,
      });

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x121418, alpha: 1 });

      const drawCapsule = (
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        radius: number,
        color: number,
        alpha = 1,
      ) => {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const d = Math.hypot(dx, dy) || 1;
        const nx = -dy / d;
        const ny = dx / d;
        g.moveTo(x0 + nx * radius, y0 + ny * radius);
        g.lineTo(x1 + nx * radius, y1 + ny * radius);
        g.arc(x1, y1, radius, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
        g.lineTo(x0 - nx * radius, y0 - ny * radius);
        g.arc(x0, y0, radius, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
        g.fill({ color, alpha });
      };

      const cap = (t0: number, p0: number, t1: number, p1: number, radius: number, color: number, alpha = 1) => {
        const a = pt(t0, p0);
        const b = pt(t1, p1);
        drawCapsule(a.x, a.y, b.x, b.y, radius, color, alpha);
      };

      const poly = (pts: { x: number; y: number }[], color: number, alpha = 1) => {
        const first = pts[0];
        if (!first) return;
        g.moveTo(first.x, first.y);
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i];
          if (p) g.lineTo(p.x, p.y);
        }
        g.fill({ color, alpha });
      };

      const back = -len * 0.4;
      const mid = len * 0.02;
      const grip1 = len * 0.25;
      const cone1 = len * 0.4;

      // Soft contact shadow on the ground under the foot of an upright pen.
      const foot = pt(cone1, 0);
      g.ellipse(foot.x + r * 0.65, foot.y + r * 1.45, r * 2.6, r * 0.62);
      g.fill({ color: 0x000000, alpha: 0.22 });
      g.ellipse(foot.x + r * 0.28, foot.y + r * 0.85, r * 1.35, r * 0.32);
      g.fill({ color: 0x000000, alpha: 0.3 });

      const lip = back - r * 0.2;
      const collarBottom = lip + r * 0.78;
      const barrelTop = collarBottom + r;

      // Barrel — highlight on the left edge, shade on the right
      cap(barrelTop, 0, mid, 0, r, 0x243e52);
      cap(barrelTop + r * 0.35, r * 0.42, mid - r * 0.35, r * 0.42, r * 0.2, 0x8aafc4, 0.55);
      cap(barrelTop + r * 0.2, -r * 0.5, mid - r * 0.25, -r * 0.5, r * 0.18, 0x101820, 0.4);

      // Ink window
      cap(-len * 0.155, 0, -len * 0.055, 0, r * 0.22, 0x10283c);
      cap(-len * 0.14, -r * 0.06, -len * 0.07, -r * 0.06, r * 0.08, 0x8ec4e4, 0.8);

      // Accent band
      cap(-len * 0.22, 0, -len * 0.22 + r * 0.28, 0, r * 1.04, 0x6a8fad);

      // Pocket clip on the right side, below the clicker dome
      cap(back + r * 1.15, -r * 0.2, back + r * 1.05, -r * 1.05, r * 0.16, 0xc5ced4);
      cap(back + r * 1.2, -r * 1.02, -len * 0.02, -r * 1.16, r * 0.13, 0xd5dee4);
      const clipEnd = pt(-len * 0.005, -r * 1.28);
      g.circle(clipEnd.x, clipEnd.y, r * 0.2);
      g.fill({ color: 0xe7eef2 });
      g.circle(clipEnd.x - hx * r * 0.06 - cos * r * 0.04, clipEnd.y - hy * r * 0.06 - sin * r * 0.04, r * 0.07);
      g.fill({ color: 0xffffff, alpha: 0.55 });

      // Rubber grip
      cap(mid, 0, grip1, 0, r * 1.08, 0x12181d);
      for (let i = 1; i <= 3; i++) {
        const t = mid + ((grip1 - mid) * i) / 4;
        const a = pt(t, r * 1.02);
        const b = pt(t, -r * 1.02);
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke({ width: Math.max(1.25, r * 0.07), color: 0x2a343c, alpha: 0.9 });
      }

      // Metal nose — short cone, not a pencil point
      cap(grip1 - r * 0.08, 0, grip1 + r * 0.28, 0, r * 1.02, 0xc5ced4);
      poly(
        [pt(grip1 + r * 0.12, r * 0.98), pt(cone1, r * 0.3), pt(cone1, -r * 0.3), pt(grip1 + r * 0.12, -r * 0.98)],
        0xc5ced4,
      );
      poly(
        [pt(grip1 + r * 0.18, r * 0.98), pt(cone1, r * 0.3), pt(cone1, 0), pt(grip1 + r * 0.18, 0)],
        0x7e8b94,
        0.72,
      );
      poly(
        [pt(grip1 + r * 0.2, -r * 0.72), pt(cone1 - r * 0.15, -r * 0.2), pt(cone1 - r * 0.2, -r * 0.08), pt(grip1 + r * 0.35, -r * 0.42)],
        0xf7fafc,
        0.38,
      );
      const nose = pt(cone1, 0);
      g.circle(nose.x, nose.y, r * 0.32);
      g.fill({ color: 0xd5dee4 });
      g.circle(nose.x - hx * r * 0.08, nose.y - hy * r * 0.08, r * 0.12);
      g.fill({ color: 0xffffff, alpha: 0.28 });
      g.circle(nose.x, nose.y, r * 0.15);
      g.fill({ color: 0x1a1e22 });

      const travel = Math.max(0, Math.min(1.16, tipPos));
      const pointLen = travel * r * 1.4;
      if (pointLen > 0.4) {
        const tip = pt(cone1 + pointLen, 0);
        drawCapsule(nose.x, nose.y, tip.x, tip.y, r * 0.09, 0xdfe6ea);
        drawCapsule(
          nose.x - hx * r * 0.035,
          nose.y - hy * r * 0.035,
          tip.x - hx * r * 0.035,
          tip.y - hy * r * 0.035,
          r * 0.035,
          0xffffff,
          0.4 + flash * 0.35,
        );
        g.circle(tip.x, tip.y, r * 0.13);
        g.fill({ color: 0x23282c });
        g.circle(tip.x - cos * r * 0.03 - hx * r * 0.03, tip.y - sin * r * 0.03 - hy * r * 0.03, r * 0.045);
        g.fill({ color: 0xffffff, alpha: 0.4 });
      }

      // Chrome plunger slides through an open metal collar. Full press puts the crown flush with the lip.
      const sunk = Math.max(0, Math.min(1, press));
      const btnR = r * 0.62;
      const restTop = lip - r * 0.98;
      const topT = restTop + (lip - restTop) * sunk;
      const domeAlong = btnR * (0.86 - sunk * 0.34);
      const domeCenter = topT + domeAlong;

      const blob = (t: number, p: number, aRad: number, cRad: number, color: number, alpha = 1) => {
        const c = pt(t, p);
        const steps = 32;
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const x = c.x - cos * Math.cos(a) * aRad + hx * Math.sin(a) * cRad;
          const y = c.y - sin * Math.cos(a) * aRad + hy * Math.sin(a) * cRad;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.fill({ color, alpha });
      };

      // Shaft slides down inside the housing. Collar is drawn after to mask it.
      cap(domeCenter, 0, lip + r * 1.15, 0, btnR, 0xb7c2c8);
      cap(domeCenter, btnR * 0.42, lip + r * 0.95, btnR * 0.42, btnR * 0.14, 0xf5f8fa, 0.9);
      cap(domeCenter, -btnR * 0.48, lip + r * 0.9, -btnR * 0.48, btnR * 0.1, 0x7d888f, 0.55);
      blob(domeCenter, 0, domeAlong, btnR, 0xd5dee4);
      blob(domeCenter, btnR * 0.28, domeAlong * 0.45, btnR * 0.22, 0xffffff, 0.82 + flash * 0.18);
      blob(domeCenter + domeAlong * 0.15, -btnR * 0.2, domeAlong * 0.35, btnR * 0.28, 0x8e989f, 0.45);

      // Collar walls with an open bore so the plunger can sit in the mouth, not under a lid.
      const wall = (outer: number, inner: number, color: number) => {
        poly(
          [pt(lip, outer), pt(collarBottom, outer), pt(collarBottom, inner), pt(lip, inner)],
          color,
        );
      };
      wall(r * 1.1, btnR * 1.12, 0xa8b3bb);
      wall(-btnR * 1.12, -r * 1.1, 0x8d989f);
      poly(
        [pt(lip, r * 1.1), pt(lip + r * 0.09, r * 1.1), pt(lip + r * 0.09, btnR * 1.12), pt(lip, btnR * 1.12)],
        0xe8eef3,
      );
      poly(
        [pt(lip, -btnR * 1.12), pt(lip + r * 0.09, -btnR * 1.12), pt(lip + r * 0.09, -r * 1.1), pt(lip, -r * 1.1)],
        0xc5ced4,
      );

      if (flash > 0.04) {
        const crown = pt(topT, btnR * 0.15);
        g.circle(crown.x, crown.y, btnR * (1.15 + (1 - flash) * 0.45));
        g.stroke({ width: Math.max(1.5, r * 0.06), color: 0xf4f7f8, alpha: flash * 0.5 });
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

export const penClicker: ExperienceModule = {
  id: "pen-clicker",
  collection: "studio",
  name: "Pen Clicker",
  modality: "Click",
  tagline: "Retractable click — tip out, tip in, again.",
  hint: "Press and hold the clicker, then release.",
  accent: "#6a8fad",
  mount,
};
