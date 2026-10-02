import { Container, Graphics } from "pixi.js";
import { createHud } from "@/engine/hud";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function smoothstep(v: number) {
  const x = clamp(v, 0, 1);
  return x * x * (3 - 2 * x);
}

type Pt = { x: number; y: number };

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  let open = 0.42;
  let target = 0.42;
  let openVel = 0;
  let dragging = false;
  let lastOpen = 0.42;
  let toothPhase = 0;
  let teeth = 140;
  let time = 0;
  let hang = 0;
  let hangVel = 0;
  let pull = 0;
  let pullVel = 0;
  let bite = 0;
  let hotTooth = 0;

  const track = () => {
    const top = h * 0.14;
    const bottom = h * 0.84;
    return { cx: w * 0.5, top, bottom, len: bottom - top };
  };

  const sliderS = () => 1 - open;

  const sliderY = () => {
    const t = track();
    return t.top + sliderS() * t.len;
  };

  const hit = (x: number, y: number) => {
    const t = track();
    const sy = sliderY();
    if (Math.hypot(x - t.cx, y - sy) < 48) return true;
    if (Math.hypot(x - t.cx, y - (sy + 36)) < 28) return true;
    return Math.abs(x - t.cx) < 48 && y >= t.top - 16 && y <= t.bottom + 28;
  };

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    if (!hit(e.clientX, e.clientY)) return;
    dragging = true;
    const t = track();
    target = clamp((t.bottom - e.clientY) / t.len, 0, 1);
    haptics.tap(8);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const t = track();
    target = clamp((t.bottom - e.clientY) / t.len, 0, 1);
  };
  const onUp = () => {
    dragging = false;
  };

  const hud = createHud(ctx.host);
  hud.slider("Teeth", 60, 260, teeth, (v) => {
    teeth = v;
  });

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  const toothShape = (x: number, y: number, tw: number, th: number, dir: number, color: number, alpha: number) => {
    const tip = tw * 0.38;
    const body = tw - tip;
    if (dir > 0) {
      g.moveTo(x, y - th / 2);
      g.lineTo(x + body, y - th / 2);
      g.lineTo(x + tw, y);
      g.lineTo(x + body, y + th / 2);
      g.lineTo(x, y + th / 2);
    } else {
      g.moveTo(x + tw, y - th / 2);
      g.lineTo(x + tip, y - th / 2);
      g.lineTo(x, y);
      g.lineTo(x + tip, y + th / 2);
      g.lineTo(x + tw, y + th / 2);
    }
    g.closePath();
    g.fill({ color, alpha });
  };

  return {
    update(dt: number) {
      time += dt;
      const prev = open;
      if (dragging) {
        open += (target - open) * Math.min(1, dt * 34);
        openVel = (open - prev) / Math.max(dt, 0.001);
      } else {
        openVel += (target - open) * 46 * dt;
        openVel *= Math.exp(-12 * dt);
        open = clamp(open + openVel * dt, 0, 1);
      }

      const dOpen = open - lastOpen;
      const count = Math.max(24, Math.round(teeth));
      const speed = clamp(Math.abs(dOpen) / Math.max(0.008, dt), 0, 1);
      const chunk = clamp((260 - count) / 200, 0, 1);

      if (dOpen !== 0) {
        toothPhase += Math.abs(dOpen) * count;
        let clicked = 0;
        while (toothPhase > 1 && clicked < 8) {
          toothPhase -= 1;
          clicked++;
          const direction = dOpen > 0 ? "open" : "close";
          const pitch = 0.46 + chunk * 0.28 + speed * (1.05 + (1 - chunk) * 0.85);
          audio.zip(0.38 + speed * 0.42 + chunk * 0.2, pitch, direction);
          if (clicked === 1) {
            hotTooth = clamp(Math.round(sliderS() * count), 0, count - 1);
            bite = 1;
            pullVel += (dOpen > 0 ? -1 : 1) * (0.05 + chunk * 0.16);
            if (speed > 0.16) haptics.tap(2 + Math.round(speed * 5 + chunk * 5));
          }
        }
        if (toothPhase > 1) toothPhase %= 1;
      }
      lastOpen = open;
      bite *= Math.exp(-16 * dt);

      const slack = clamp(Math.pow(Math.max(0, open), 0.55) * 1.2, 0, 1);
      const openRate = dOpen / Math.max(dt, 0.001);
      hangVel += -openRate * (0.85 + slack) * dt;
      const hangSpring = 3.6 + (1 - slack) * 14;
      hangVel += -hang * hangSpring * dt;
      hangVel *= Math.exp(-(1.05 + (1 - slack) * 3.2) * dt);
      hang += hangVel * dt;
      hang = clamp(hang, -1.25, 1.25);
      const breeze = Math.sin(time * 1.08) * 0.62 + Math.sin(time * 0.51 + 1.1) * 0.22;
      const pose = clamp((hang + breeze) * slack, -1, 1);

      const lean = clamp(-openVel * 0.2, -0.62, 0.62);
      pullVel += (lean - pull) * 20 * dt;
      pullVel *= Math.exp(-3.1 * dt);
      pull += pullVel * dt;
      pull = clamp(pull, -0.95, 0.95);

      const t = track();
      const sSlider = sliderS();
      const sy = t.top + sSlider * t.len;
      const cloth = Math.min(w * 0.36, 168);
      const pitchPx = t.len / count;
      const toothH = clamp(pitchPx * 0.58, 2.2, 13);
      const toothW = clamp(pitchPx * 0.9, 3.4, 16);
      const chainHalf = clamp(toothW * 0.42 + 3.5, 6, 12);
      const ride = Math.sin(toothPhase * Math.PI) * Math.min(2.6, pitchPx * 0.28);
      const bodyY = sy + (openVel >= 0 ? -ride : ride);

      const chainX = (side: number, s: number) => {
        if (s <= sSlider) return t.cx + side * chainHalf;
        const free = Math.max(1 - sSlider, 0.015);
        const u = (s - sSlider) / free;
        const throat = smoothstep(Math.min(1, u / 0.2));
        const gap = chainHalf + throat * (12 + slack * cloth * 0.2);
        const bow = Math.sin(Math.min(u, 1.15) * Math.PI) * slack * (20 + slack * 28);
        const swing = pose * u * u * (18 + slack * 40);
        const flutter = Math.sin(time * 1.85 + side * 1.4 + u * 3.4) * slack * 8 * u * u;
        let x = t.cx + side * (gap + bow) + swing + side * flutter;
        const limit = cloth - 12;
        if (side < 0) x = Math.min(t.cx - chainHalf * 0.4, Math.max(t.cx - limit, x));
        else x = Math.max(t.cx + chainHalf * 0.4, Math.min(t.cx + limit, x));
        return x;
      };

      const sampleSide = (side: number) => {
        const pts: Pt[] = [];
        const steps = 34;
        for (let i = 0; i <= steps; i++) {
          const s = i / steps;
          pts.push({ x: chainX(side, s), y: t.top + s * t.len });
        }
        const tail = 4 + slack * 40;
        const tip = pts[pts.length - 1];
        for (let i = 1; i <= 6; i++) {
          const u = i / 6;
          pts.push({
            x: tip.x + pose * u * u * (16 + slack * 36) + side * slack * 12 * u,
            y: tip.y + tail * u + slack * 8 * u * u,
          });
        }
        return pts;
      };

      const left = sampleSide(-1);
      const right = sampleSide(1);
      const hem = 34;
      const looseAt = Math.round(clamp(sSlider, 0, 1) * hem);

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x14161a, alpha: 1 });

      const fillCloth = (side: number, pts: Pt[], color: number) => {
        const outer = t.cx + side * cloth;
        g.moveTo(outer, t.top);
        g.lineTo(outer, t.bottom);
        g.lineTo(pts[hem].x, pts[hem].y);
        for (let i = hem - 1; i >= 0; i--) g.lineTo(pts[i].x, pts[i].y);
        g.closePath();
        g.fill({ color, alpha: 0.96 });
      };
      fillCloth(-1, left, 0x3a4a5a);
      fillCloth(1, right, 0x324050);

      g.moveTo(t.cx - chainHalf, t.top);
      g.lineTo(t.cx + chainHalf, t.top);
      g.lineTo(t.cx + chainHalf, bodyY);
      g.lineTo(t.cx - chainHalf, bodyY);
      g.closePath();
      g.fill({ color: 0x24303c, alpha: 1 });

      const strokeRibbon = (pts: Pt[], width: number, color: number) => {
        g.moveTo(pts[looseAt].x, pts[looseAt].y);
        for (let i = looseAt + 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        g.stroke({ width, color, alpha: 0.96, cap: "round", join: "round" });
      };
      strokeRibbon(left, chainHalf * 1.7, 0x2a3844);
      strokeRibbon(right, chainHalf * 1.7, 0x263440);

      const bodyTop = (bodyY - 24 - t.top) / t.len;
      const bodyBot = (bodyY + 22 - t.top) / t.len;
      for (let i = 0; i < count; i++) {
        const s = (i + 0.5) / count;
        if (s > bodyTop && s < bodyBot) continue;
        const fromLeft = i % 2 === 0;
        const hot = bite > 0.2 && i === hotTooth;
        const color = hot ? 0xf4e6bc : fromLeft ? 0xc4b080 : 0xb5a372;
        const y = t.top + s * t.len;
        if (s < sSlider) {
          const x = fromLeft ? t.cx - toothW * 0.58 : t.cx - toothW * 0.42;
          toothShape(x, y, toothW, toothH, fromLeft ? 1 : -1, color, hot ? 1 : 0.94);
        } else {
          const side = fromLeft ? -1 : 1;
          const xBase = chainX(side, s);
          const x = side < 0 ? xBase - toothW * 0.2 : xBase - toothW * 0.8;
          toothShape(x, y, toothW * 0.86, toothH * 0.9, side < 0 ? 1 : -1, color, 0.9);
        }
      }

      const cap = (pt: Pt) => {
        g.circle(pt.x, pt.y, 3.2 + slack * 1.4);
        g.fill({ color: 0xc4b080, alpha: 0.9 });
      };
      cap(left[left.length - 1]);
      cap(right[right.length - 1]);

      const bodyW = 34 + bite * 3 + chunk * 4;
      const bodyH = 46 - bite * 3;
      g.roundRect(t.cx - bodyW / 2, bodyY - 24, bodyW, bodyH, 7);
      g.fill({ color: 0xd4c490, alpha: 1 });
      g.roundRect(t.cx - bodyW / 2 + 3, bodyY - 20, bodyW - 6, 12, 3);
      g.fill({ color: 0xf0e6c0, alpha: 0.45 + bite * 0.35 });
      g.roundRect(t.cx - bodyW / 2 + 2, bodyY - 4, 5, 18, 2);
      g.fill({ color: 0xb7a56f, alpha: 0.95 });
      g.roundRect(t.cx + bodyW / 2 - 7, bodyY - 4, 5, 18, 2);
      g.fill({ color: 0xb7a56f, alpha: 0.95 });

      const hingeX = t.cx;
      const hingeY = bodyY + 18;
      const ang = pull;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const rot = (x: number, y: number) => ({
        x: hingeX + x * cos - y * sin,
        y: hingeY + x * sin + y * cos,
      });
      const tab = [
        rot(-6.5, 2),
        rot(6.5, 2),
        rot(5.5, 32),
        rot(-5.5, 32),
      ];
      g.moveTo(tab[0].x, tab[0].y);
      for (let i = 1; i < tab.length; i++) g.lineTo(tab[i].x, tab[i].y);
      g.closePath();
      g.fill({ color: 0xc4b080, alpha: 0.96 });
      const ring = rot(0, 40);
      g.circle(ring.x, ring.y, 7.5);
      g.stroke({ width: 2.6, color: 0xc4b080, alpha: 0.96 });
      g.circle(hingeX, hingeY, 2.4);
      g.fill({ color: 0x8c7d58, alpha: 0.9 });
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

export const zipper: ExperienceModule = {
  id: "zipper",
  collection: "field",
  name: "Zipper",
  modality: "Slide",
  tagline: "Pull the slider — teeth chatter open and shut.",
  hint: "Drag the zipper up and down.",
  accent: "#c4b080",
  mount,
};
