import { Container, Graphics } from "pixi.js";
import { createHud } from "@/engine/hud";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Bubble = {
  x: number;
  y: number;
  r: number;
  popped: boolean;
  popAnim: number;
  pitch: number;
  /** Direction the air jet leaves the cell. */
  puffAngle: number;
  /** Neighbor-film ripple, 1 → 0. */
  wobble: number;
  wobblePhase: number;
};

function filmSquash(b: Bubble, amp: number) {
  const drive = b.popAnim * 0.42 + b.wobble * 0.18;
  if (drive < 0.01) return 0;
  return Math.sin((1 - b.popAnim) * Math.PI * 5 + b.wobble * 13 + b.wobblePhase) * Math.min(amp, drive);
}

function drawPopped(g: Graphics, b: Bubble) {
  const anim = b.popAnim;
  if (anim <= 0.02) {
    const rr = b.r * 0.55;
    const squash = filmSquash(b, 0.16);
    if (Math.abs(squash) > 0.01) g.ellipse(b.x, b.y, rr * (1 + squash), rr * (1 - squash));
    else g.circle(b.x, b.y, rr);
    g.stroke({ width: 1.5, color: 0x4a5a62, alpha: 0.45 });
    g.circle(b.x - rr * 0.15, b.y - rr * 0.1, rr * 0.18);
    g.fill({ color: 0x1a2228, alpha: 0.5 });
    return;
  }

  const c = Math.cos(b.puffAngle);
  const s = Math.sin(b.puffAngle);
  const squash = filmSquash(b, 0.46);
  const scale = 0.55 + anim * 0.5;
  const recoil = anim * b.r * 0.12;
  const cx = b.x - c * recoil;
  const cy = b.y - s * recoil;
  const rx = b.r * scale * (1 + squash);
  const ry = Math.max(1, b.r * scale * (1 - squash * 0.85));

  g.ellipse(cx, cy, rx, ry);
  g.fill({ color: 0x6a9aaa, alpha: 0.2 + anim * 0.4 });
  g.ellipse(cx - rx * 0.22, cy - ry * 0.2, rx * 0.26, Math.max(1, ry * 0.18));
  g.fill({ color: 0xffffff, alpha: 0.2 * anim });

  const hole = b.r * (0.14 + (1 - anim) * 0.2);
  g.ellipse(cx + c * b.r * 0.06, cy + s * b.r * 0.06, hole * (1 - squash * 0.2), hole * (1 + squash * 0.18));
  g.fill({ color: 0x1a2228, alpha: 0.4 + (1 - anim) * 0.15 });

  g.ellipse(cx, cy, rx, ry);
  g.stroke({ width: 1.5, color: 0xa8d0dc, alpha: 0.3 + anim * 0.35 });

  const tip = b.r * (0.2 + (1 - anim) * 1.15);
  g.moveTo(b.x + c * hole, b.y + s * hole);
  g.lineTo(b.x + c * tip, b.y + s * tip);
  g.stroke({ width: 1.6, color: 0xd4eef6, alpha: anim * 0.42 });

  for (let k = 0; k < 4; k++) {
    const along = b.r * (0.2 + (1 - anim) * (0.48 + k * 0.38));
    const side = Math.sin((1 - anim) * 9 + k * 1.7) * b.r * 0.08 * anim;
    const px = b.x + c * along - s * side;
    const py = b.y + s * along + c * side;
    const pr = b.r * (0.1 + (1 - anim) * 0.16) * (1 - k * 0.16);
    g.circle(px, py, Math.max(1.2, pr));
    g.fill({ color: 0xd4eef6, alpha: anim * (0.52 - k * 0.1) });
  }
}

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  const bubbles: Bubble[] = [];

  function layout(keepState = false) {
    const prev = keepState
      ? new Map(
          bubbles.map(
            (b, i) =>
              [
                i,
                {
                  popped: b.popped,
                  popAnim: b.popAnim,
                  puffAngle: b.puffAngle,
                  wobble: b.wobble,
                  wobblePhase: b.wobblePhase,
                },
              ] as const,
          ),
        )
      : null;
    bubbles.length = 0;
    const narrow = w < 560;
    // Twice as many per row as the original grid; keep the original bubble radius
    const cols = Math.max(4, Math.round((narrow ? 10 : 16) * density));
    const rows = Math.max(3, Math.round((narrow ? 7 : 6) * density));
    const sizeCols = narrow ? 5 : 8;
    const marginX = w * 0.08;
    const marginY = h * 0.12;
    const cellW = (w - marginX * 2) / cols;
    const cellH = (h - marginY * 2) / rows;
    const sizeCellW = (w - marginX * 2) / sizeCols;
    const r = Math.min(sizeCellW, cellH) * 0.38;
    let i = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const offset = row % 2 === 1 ? cellW * 0.5 : 0;
        if (row % 2 === 1 && col === cols - 1) continue;
        const state = prev?.get(i);
        bubbles.push({
          x: marginX + cellW * (col + 0.5) + offset,
          y: marginY + cellH * (row + 0.5),
          r,
          popped: state?.popped ?? false,
          popAnim: state?.popAnim ?? 0,
          pitch: 0.85 + ((col + row) % 5) * 0.08,
          puffAngle: state?.puffAngle ?? 0,
          wobble: state?.wobble ?? 0,
          wobblePhase: state?.wobblePhase ?? Math.random() * Math.PI * 2,
        });
        i++;
      }
    }
  }
  let density = 1;
  const hud = createHud(ctx.host);
  hud.slider("Sheet", 0.55, 1.35, density, (v) => {
    density = v;
    layout(true);
  });
  layout();

  const hit = (x: number, y: number) => {
    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i];
      if (!b.popped && Math.hypot(b.x - x, b.y - y) < b.r * 1.05) return i;
    }
    return null;
  };

  const popOne = (i: number) => {
    const b = bubbles[i];
    if (b.popped) return;
    b.popped = true;
    b.popAnim = 1;
    b.puffAngle = Math.random() * Math.PI * 2;
    const reach = b.r * 2.7;
    for (const other of bubbles) {
      if (other === b) continue;
      const dist = Math.hypot(other.x - b.x, other.y - b.y);
      if (dist < reach) other.wobble = Math.max(other.wobble, 1 - dist / reach);
    }
    audio.pop(0.85, b.pitch);
    haptics.tap(8);
    if (bubbles.every((x) => x.popped)) {
      window.setTimeout(() => {
        for (const bubble of bubbles) {
          bubble.popped = false;
          bubble.popAnim = 0;
          bubble.wobble = 0;
        }
        audio.whoosh(0.25);
      }, 700);
    }
  };

  let pointerDown = false;
  const onPointerDown = (e: PointerEvent) => {
    pointerDown = true;
    void audio.resume();
    const i = hit(e.clientX, e.clientY);
    if (i != null) popOne(i);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!pointerDown) return;
    const i = hit(e.clientX, e.clientY);
    if (i != null) popOne(i);
  };
  const onPointerUp = () => {
    pointerDown = false;
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  el.style.touchAction = "none";

  return {
    update(dt: number) {
      for (const b of bubbles) {
        if (b.popAnim > 0) b.popAnim = Math.max(0, b.popAnim - dt * 1.75);
        if (b.wobble > 0) b.wobble = Math.max(0, b.wobble - dt * 2.6);
      }

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x14181c, alpha: 1 });

      // Sheet
      if (bubbles.length) {
        const pad = bubbles[0].r * 1.4;
        const minX = Math.min(...bubbles.map((b) => b.x)) - pad;
        const minY = Math.min(...bubbles.map((b) => b.y)) - pad;
        const maxX = Math.max(...bubbles.map((b) => b.x)) + pad;
        const maxY = Math.max(...bubbles.map((b) => b.y)) + pad;
        g.roundRect(minX, minY, maxX - minX, maxY - minY, 14);
        g.fill({ color: 0x2a3a42, alpha: 0.55 });
      }

      for (const b of bubbles) {
        if (b.popped) {
          drawPopped(g, b);
          continue;
        }
        const squash =
          b.wobble > 0.02 ? Math.sin(b.wobble * 13 + b.wobblePhase) * b.wobble * 0.18 : 0;
        const rx = b.r * (1 + squash);
        const ry = b.r * (1 - squash);
        if (Math.abs(squash) > 0.01) g.ellipse(b.x, b.y, rx, ry);
        else g.circle(b.x, b.y, b.r);
        g.fill({ color: 0x6a9aaa, alpha: 0.55 });
        g.circle(b.x - rx * 0.28, b.y - ry * 0.28, b.r * 0.35);
        g.fill({ color: 0xffffff, alpha: 0.35 });
        if (Math.abs(squash) > 0.01) g.ellipse(b.x, b.y, rx, ry);
        else g.circle(b.x, b.y, b.r);
        g.stroke({ width: 1.5, color: 0xa8d0dc, alpha: 0.45 });
      }
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
      layout(true);
    },
    destroy() {
      hud.destroy();
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      layer.destroy({ children: true });
    },
  };
}

export const bubbleWrap: ExperienceModule = {
  id: "bubble-wrap",
  collection: "studio",
  name: "Bubble Wrap",
  modality: "Pop",
  tagline: "Pop every blister — soft membrane snap.",
  hint: "Tap or drag to pop. Sheet refills when empty.",
  accent: "#6a9aaa",
  mount,
};
