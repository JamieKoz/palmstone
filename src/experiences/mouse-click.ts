import { Container, Graphics, Text } from "pixi.js";
import { createHud } from "@/engine/hud";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type NoteResult = "perfect" | "hit" | "miss";

type Note = {
  lane: 0 | 1;
  t: number;
  judged: boolean;
  result: NoteResult | null;
  fade: number;
};

const NOTE_RATE = 0.74;
const PERFECT_W = 0.055;
const HIT_W = 0.135;

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const world = new Graphics();
  const mouseRig = new Container();
  const mouseG = new Graphics();
  const fx = new Graphics();
  layer.addChild(world);
  mouseRig.addChild(mouseG);
  layer.addChild(mouseRig);
  layer.addChild(fx);

  let leftPress = 0;
  let rightPress = 0;
  let scroll = 0;
  let wheelSpin = 0;

  let mouseScale = 1;
  let interactive = false;
  const notes: Note[] = [];
  let nextLane: 0 | 1 = 0;
  let spawnIn = 0;
  let judgeLife = 0;
  let judgeKind: NoteResult = "hit";
  let ringFlash = 0;
  let tilt = 0;
  let tiltV = 0;
  let squash = 1;
  let squashV = 0;
  const waves: { x: number; y: number; life: number }[] = [];

  const hud = createHud(ctx.host);
  hud.slider("Size", 0.7, 1.45, mouseScale, (v) => {
    mouseScale = v;
  });
  hud.toggle("Interactive", "Interactive", false, (on) => {
    interactive = on;
    notes.length = 0;
    nextLane = 0;
    spawnIn = on ? 0.35 : 0;
    judgeLife = 0;
    ringFlash = 0;
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

  const geom = () => {
    const mw = Math.min(w, h) * 0.38 * mouseScale;
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

  const showJudge = (label: string, kind: NoteResult) => {
    banner.text = label;
    judgeKind = kind;
    judgeLife = 1;
    ringFlash = kind === "miss" ? -1 : 1;
  };

  const judgeNote = () => {
    let live: Note | undefined;
    let best = Infinity;
    for (const note of notes) {
      if (note.judged) continue;
      const off = Math.abs(note.t - 1);
      if (off < best) {
        best = off;
        live = note;
      }
    }
    if (!live || best > 0.42) return;

    live.judged = true;
    live.fade = 1;
    if (best <= PERFECT_W) {
      live.result = "perfect";
      showJudge("Perfect", "perfect");
    } else if (best <= HIT_W) {
      live.result = "hit";
      showJudge("Hit", "hit");
    } else {
      live.result = "miss";
      showJudge(live.t < 1 ? "Early" : "Late", "miss");
    }
    spawnIn = 0.55;
  };

  const kick = (which: "left" | "right" | "wheel") => {
    if (which === "left") tiltV -= 2.15;
    else if (which === "right") tiltV += 2.15;
    else tiltV += tilt >= 0 ? -0.9 : 0.9;
    squashV -= which === "wheel" ? 2.5 : 1.85;
    const { cx, cy, mw, mh } = geom();
    waves.push({
      x: which === "left" ? cx - mw * 0.22 : which === "right" ? cx + mw * 0.22 : cx,
      y: which === "wheel" ? cy - mh * 0.18 : cy - mh * 0.2,
      life: 1,
    });
    if (waves.length > 5) waves.shift();
  };

  const fire = (which: "left" | "right" | "wheel") => {
    kick(which);
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
    if (interactive) judgeNote();
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
      judgeLife = Math.max(0, judgeLife - dt * 1.2);
      ringFlash *= Math.exp(-dt * 3.4);

      const step = Math.min(dt, 0.034);
      tiltV += -tilt * 168 * step;
      tiltV *= Math.exp(-step * 7.5);
      tilt += tiltV * step;
      squashV += (1 - squash) * 340 * step;
      squashV *= Math.exp(-step * 12);
      squash += squashV * step;

      const { cx, cy, mw, mh } = geom();
      const stretch = 1 + (1 - squash) * 0.42;
      mouseRig.pivot.set(cx, cy);
      mouseRig.position.set(cx, cy + (1 - squash) * mh * 0.04);
      mouseRig.rotation = tilt;
      mouseRig.scale.set(stretch, squash);

      if (interactive) {
        for (let i = notes.length - 1; i >= 0; i--) {
          const note = notes[i];
          if (!note.judged) {
            note.t += dt * NOTE_RATE;
            if (note.t > 1 + HIT_W) {
              note.judged = true;
              note.result = "miss";
              note.fade = 1;
              showJudge("Miss", "miss");
              spawnIn = 0.55;
            }
          } else {
            note.fade = Math.max(0, note.fade - dt * (note.result === "miss" ? 1.6 : 2.6));
            if (note.fade <= 0) notes.splice(i, 1);
          }
        }
        if (!notes.some((n) => !n.judged)) {
          spawnIn -= dt;
          if (spawnIn <= 0) {
            notes.push({ lane: nextLane, t: 0, judged: false, result: null, fade: 1 });
            nextLane = nextLane === 0 ? 1 : 0;
            spawnIn = 0;
          }
        }
      } else if (notes.length) {
        notes.length = 0;
      }
      world.clear();
      world.rect(0, 0, w, h);
      world.fill({ color: 0x111418, alpha: 1 });

      // Desk shadow stays put so the body reads as a wobble
      world.ellipse(cx + 6, cy + mh * 0.42, mw * 0.7, mh * 0.12);
      world.fill({ color: 0x000000, alpha: 0.3 });

      mouseG.clear();
      // Body
      mouseG.roundRect(cx - mw * 0.5, cy - mh * 0.45, mw, mh * 0.95, mw * 0.45);
      mouseG.fill({ color: 0x2a3038, alpha: 1 });
      mouseG.roundRect(cx - mw * 0.42, cy - mh * 0.38, mw * 0.84, mh * 0.35, mw * 0.35);
      mouseG.fill({ color: 0xffffff, alpha: 0.05 });

      // Left button
      const ld = leftPress * 3;
      mouseG.moveTo(cx - mw * 0.48, cy - mh * 0.42 + ld);
      mouseG.arc(cx, cy - mh * 0.05 + ld, mw * 0.48, Math.PI, Math.PI * 1.5);
      mouseG.lineTo(cx - 2, cy - mh * 0.05 + ld);
      mouseG.lineTo(cx - 2, cy - mh * 0.42 + ld);
      mouseG.closePath();
      mouseG.fill({ color: leftPress > 0.15 ? 0x3a4450 : 0x343c46, alpha: 1 });

      // Right button
      const rd = rightPress * 3;
      mouseG.moveTo(cx + 2, cy - mh * 0.42 + rd);
      mouseG.lineTo(cx + 2, cy - mh * 0.05 + rd);
      mouseG.arc(cx, cy - mh * 0.05 + rd, mw * 0.48, Math.PI * 1.5, 0);
      mouseG.lineTo(cx + mw * 0.48, cy - mh * 0.42 + rd);
      mouseG.closePath();
      mouseG.fill({ color: rightPress > 0.15 ? 0x3a4450 : 0x343c46, alpha: 1 });

      // Seam
      mouseG.moveTo(cx, cy - mh * 0.4);
      mouseG.lineTo(cx, cy - mh * 0.02);
      mouseG.stroke({ width: 2, color: 0x1a1e24, alpha: 0.9 });

      // Scroll wheel
      const wy = cy - mh * 0.18;
      mouseG.roundRect(cx - mw * 0.08, wy - mh * 0.12, mw * 0.16, mh * 0.24, 6);
      mouseG.fill({ color: scroll > 0.1 ? 0x5a6570 : 0x1e242c, alpha: 1 });
      for (let i = -2; i <= 2; i++) {
        const yy = wy + i * 7 + Math.sin(wheelSpin + i) * 2;
        mouseG.moveTo(cx - mw * 0.05, yy);
        mouseG.lineTo(cx + mw * 0.05, yy);
        mouseG.stroke({ width: 1.5, color: 0x8a949e, alpha: 0.5 });
      }

      fx.clear();
      for (let i = waves.length - 1; i >= 0; i--) {
        const wave = waves[i];
        wave.life -= dt * 2.4;
        if (wave.life <= 0) {
          waves.splice(i, 1);
          continue;
        }
        const t = 1 - wave.life;
        const radius = mw * (0.12 + t * 0.62);
        fx.circle(wave.x, wave.y, radius);
        fx.stroke({ width: Math.max(1.25, 3.5 * wave.life), color: 0xf3f6fa, alpha: wave.life * 0.9 });
        fx.circle(wave.x, wave.y, radius * 0.55);
        fx.stroke({ width: Math.max(1, 2 * wave.life), color: 0xd5dee8, alpha: wave.life * 0.55 });
        const gleam = mw * 0.16 * (0.35 + t * 0.9);
        fx.moveTo(wave.x - gleam, wave.y);
        fx.lineTo(wave.x + gleam, wave.y);
        fx.moveTo(wave.x, wave.y - gleam * 0.55);
        fx.lineTo(wave.x, wave.y + gleam * 0.55);
        fx.stroke({ width: 2, color: 0xffffff, alpha: wave.life * wave.life * 0.85 });
      }

      if (interactive) {
        const startY = Math.max(36, h * 0.08);
        const targetY = cy - mh * 0.22;
        const laneX = (lane: 0 | 1) => cx + (lane === 0 ? -1 : 1) * mw * 0.24;

        for (const lane of [0, 1] as const) {
          const x = laneX(lane);
          fx.moveTo(x, startY);
          fx.lineTo(x, targetY);
          fx.stroke({ width: 2, color: 0x3c4650, alpha: 0.45 });
          const hot = notes.some((n) => !n.judged && n.lane === lane && Math.abs(n.t - 1) < HIT_W);
          fx.circle(x, targetY, mw * 0.13);
          fx.stroke({ width: hot ? 4 : 2.5, color: hot ? 0xe7d7a1 : 0x8a949e, alpha: hot ? 1 : 0.45 });
        }

        for (const note of notes) {
          const x = laneX(note.lane);
          const y = startY + (targetY - startY) * note.t;
          const alpha = note.judged ? note.fade : 1;
          const col =
            note.result === "miss" ? 0xc45a4a : note.result === "perfect" ? 0xe7d7a1 : 0xd7e0e8;
          const pop = note.result && note.result !== "miss" ? 1 + (1 - note.fade) * 0.55 : 1;
          fx.moveTo(x, y - mw * 0.22);
          fx.lineTo(x, y);
          fx.stroke({ width: 3, color: 0xb7c2cc, alpha: 0.35 * alpha });
          fx.circle(x, y, mw * 0.075 * pop);
          fx.fill({ color: col, alpha });
          fx.circle(x, y, mw * 0.075 * pop);
          fx.stroke({ width: 2, color: 0xffffff, alpha: 0.45 * alpha });
        }

        if (Math.abs(ringFlash) > 0.04) {
          const mag = Math.abs(ringFlash);
          const last = notes.find((n) => n.judged && n.fade > 0.2);
          const x = last ? laneX(last.lane) : cx;
          fx.circle(x, targetY, mw * (0.13 + (1 - mag) * 0.28));
          fx.stroke({
            width: 3,
            color: ringFlash > 0 ? 0xe7d7a1 : 0xc45a4a,
            alpha: mag * 0.9,
          });
        }

        banner.visible = judgeLife > 0.04;
        banner.alpha = judgeLife;
        banner.position.set(cx, Math.max(34, cy - mh * 0.55));
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
      layer.destroy({ children: true });
    },
  };
}

export const mouseClick: ExperienceModule = {
  id: "mouse-click",
  collection: "field",
  name: "Mouse Click",
  modality: "Click",
  tagline: "Left, right, wheel — desktop click comfort.",
  hint: "Tap left or right button, or the scroll wheel.",
  accent: "#6a7580",
  mount,
};
