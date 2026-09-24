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

  let leftPress = 0;
  let rightPress = 0;
  let scroll = 0;
  let wheelSpin = 0;

  const geom = () => {
    const mw = Math.min(w, h) * 0.38;
    const mh = mw * 1.55;
    return { cx: w * 0.5, cy: h * 0.5, mw, mh };
  };

  const side = (x: number, y: number): "left" | "right" | "wheel" | null => {
    const { cx, cy, mw, mh } = geom();
    const localX = x - cx;
    const localY = y - cy;
    if (Math.abs(localX) > mw * 0.55 || Math.abs(localY) > mh * 0.55) return null;
    if (Math.abs(localX) < mw * 0.1 && localY > -mh * 0.35 && localY < mh * 0.05) return "wheel";
    if (localY > mh * 0.05) return localX < 0 ? "left" : "right";
    return localX < 0 ? "left" : "right";
  };

  const fire = (which: "left" | "right" | "wheel") => {
    if (which === "left") {
      leftPress = 1;
      audio.mouseClick(0.9, 0.95);
      haptics.tap(12);
    } else if (which === "right") {
      rightPress = 1;
      audio.mouseClick(0.85, 1.12);
      haptics.tap(10);
    } else {
      scroll = 1;
      wheelSpin += 1;
      audio.mouseClick(0.45, 1.55);
      haptics.tap(6);
    }
  };

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    const s = side(e.clientX, e.clientY);
    if (s) fire(s);
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  el.style.touchAction = "none";

  return {
    update(dt: number) {
      leftPress = Math.max(0, leftPress - dt * 5);
      rightPress = Math.max(0, rightPress - dt * 5);
      scroll = Math.max(0, scroll - dt * 4);
      wheelSpin *= Math.exp(-dt * 2.5);

      const { cx, cy, mw, mh } = geom();
      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x111418, alpha: 1 });

      // Desk shadow
      g.ellipse(cx + 6, cy + mh * 0.42, mw * 0.7, mh * 0.12);
      g.fill({ color: 0x000000, alpha: 0.3 });

      // Body
      g.roundRect(cx - mw * 0.5, cy - mh * 0.45, mw, mh * 0.95, mw * 0.45);
      g.fill({ color: 0x2a3038, alpha: 1 });
      g.roundRect(cx - mw * 0.42, cy - mh * 0.38, mw * 0.84, mh * 0.35, mw * 0.35);
      g.fill({ color: 0xffffff, alpha: 0.05 });

      // Left button
      const ld = leftPress * 3;
      g.moveTo(cx - mw * 0.48, cy - mh * 0.42 + ld);
      g.arc(cx, cy - mh * 0.05 + ld, mw * 0.48, Math.PI, Math.PI * 1.5);
      g.lineTo(cx - 2, cy - mh * 0.05 + ld);
      g.lineTo(cx - 2, cy - mh * 0.42 + ld);
      g.closePath();
      g.fill({ color: leftPress > 0.15 ? 0x3a4450 : 0x343c46, alpha: 1 });

      // Right button
      const rd = rightPress * 3;
      g.moveTo(cx + 2, cy - mh * 0.42 + rd);
      g.lineTo(cx + 2, cy - mh * 0.05 + rd);
      g.arc(cx, cy - mh * 0.05 + rd, mw * 0.48, Math.PI * 1.5, 0);
      g.lineTo(cx + mw * 0.48, cy - mh * 0.42 + rd);
      g.closePath();
      g.fill({ color: rightPress > 0.15 ? 0x3a4450 : 0x343c46, alpha: 1 });

      // Seam
      g.moveTo(cx, cy - mh * 0.4);
      g.lineTo(cx, cy - mh * 0.02);
      g.stroke({ width: 2, color: 0x1a1e24, alpha: 0.9 });

      // Scroll wheel
      const wy = cy - mh * 0.18;
      g.roundRect(cx - mw * 0.08, wy - mh * 0.12, mw * 0.16, mh * 0.24, 6);
      g.fill({ color: scroll > 0.1 ? 0x5a6570 : 0x1e242c, alpha: 1 });
      for (let i = -2; i <= 2; i++) {
        const yy = wy + i * 7 + Math.sin(wheelSpin + i) * 2;
        g.moveTo(cx - mw * 0.05, yy);
        g.lineTo(cx + mw * 0.05, yy);
        g.stroke({ width: 1.5, color: 0x8a949e, alpha: 0.5 });
      }
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    destroy() {
      el.removeEventListener("pointerdown", onDown);
      layer.destroy({ children: true });
    },
  };
}

export const mouseClick: ExperienceModule = {
  id: "mouse-click",
  name: "Mouse Click",
  modality: "Click",
  tagline: "Left, right, wheel — desktop click comfort.",
  hint: "Tap left or right button, or the scroll wheel.",
  accent: "#6a7580",
  mount,
};
