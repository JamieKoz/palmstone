import { Assets, Container, Graphics, Sprite } from "pixi.js";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

/**
 * Lamp Toggle — pull-cord lamp (svarden.se style).
 * Cord hangs from the fixture ring; pull beyond taut length in the
 * downward 180° arc to snap-toggle. Upward / sideways past taut does nothing.
 */

type Particle = {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  mass: number;
  pinned: boolean;
  initX: number;
  initY: number;
};

type Stick = { a: number; b: number; length: number };

const SEGMENTS = 12;
const GRAVITY = 1800; // px/s² — readable fall for screen coords
const CORD_MASS = 1;
const BALL_MASS = 2.2;
const GRAB_R = 36;
const BALL_R = 10;
const STRETCH_SLACK = 28; // extra px beyond rest = max stretch / snap point
const CORD_COLOR = 0xc9c9c9;
const BALL_COLOR = 0xf7bd32;

/** SVG ring center (cord attachment) in lamp.svg viewBox. */
const RING_SVG = { x: 385.4, y: 227.7 };
/**
 * Shade opening (lighter face) — where the glow belongs.
 * NOT the base at the bottom of the SVG.
 */
const BULB_SVG = { x: 88, y: 162 };
const LAMP_VB = { w: 455, h: 504 };

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

function assetUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${base}${path}`;
}

async function mount(ctx: ExperienceContext): Promise<ExperienceHandle> {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const bg = new Graphics();
  const tableG = new Graphics();
  const glow = new Graphics();
  const cordG = new Graphics();
  // Back → front: room, table, light bloom, bulb, lamp body, cord
  layer.addChild(bg);
  layer.addChild(tableG);
  layer.addChild(glow);

  let lampSprite: Sprite | null = null;
  let bulbSprite: Sprite | null = null;
  try {
    const [lampTex, bulbTex] = await Promise.all([
      Assets.load(assetUrl("/images/lamp.svg")),
      Assets.load(assetUrl("/images/bulb.svg")),
    ]);
    lampSprite = new Sprite(lampTex);
    bulbSprite = new Sprite(bulbTex);
    bulbSprite.anchor.set(0.5);
    layer.addChild(bulbSprite);
    layer.addChild(lampSprite);
  } catch {
    /* procedural fallback drawn in update */
  }

  layer.addChild(cordG);

  let on = false;
  let lightBlend = 0;
  let bloom = 0;
  let particles: Particle[] = [];
  let sticks: Stick[] = [];
  let restLength = 80;
  let dragging = false;
  let px = 0;
  let py = 0;
  let hasTriggered = false;
  let downX = 0;
  let downY = 0;

  const layoutLamp = () => {
    const lampH = Math.min(w, h) * 0.48;
    const scale = lampH / LAMP_VB.h;
    const lampW = LAMP_VB.w * scale;
    // Table surface — lamp base sits on it
    const tableTop = h * 0.72;
    const spriteY = tableTop - LAMP_VB.h * scale + 6 * scale;
    const spriteX = w * 0.52 - RING_SVG.x * scale;
    const ringX = spriteX + RING_SVG.x * scale;
    const ringY = spriteY + RING_SVG.y * scale;
    // Bulb / glow under the shade opening
    const bulbX = spriteX + BULB_SVG.x * scale;
    const bulbY = spriteY + BULB_SVG.y * scale;
    if (lampSprite) {
      lampSprite.scale.set(scale);
      lampSprite.position.set(spriteX, spriteY);
      lampSprite.alpha = 1;
    }
    if (bulbSprite) {
      bulbSprite.scale.set(scale * 0.9);
      bulbSprite.position.set(bulbX, bulbY);
    }
    return { ringX, ringY, bulbX, bulbY, scale, lampW, lampH, spriteX, spriteY, tableTop };
  };

  let lampLayout = layoutLamp();

  const anchor = () => ({ x: lampLayout.ringX, y: lampLayout.ringY });

  function rebuildRope() {
    particles = [];
    sticks = [];
    lampLayout = layoutLamp();
    const a = anchor();
    // Shorter cord — hangs above the table
    restLength = Math.min(h * 0.145, lampLayout.tableTop - a.y - 24, 96);
    restLength = Math.max(56, restLength);
    const segLen = restLength / (SEGMENTS - 1);
    for (let i = 0; i < SEGMENTS; i++) {
      const y = a.y + i * segLen;
      particles.push({
        x: a.x,
        y,
        prevX: a.x,
        prevY: y,
        mass: i === SEGMENTS - 1 ? BALL_MASS : CORD_MASS,
        pinned: i === 0,
        initX: a.x,
        initY: a.y,
      });
      if (i > 0) sticks.push({ a: i - 1, b: i, length: segLen });
    }
  }
  rebuildRope();

  const solveSticks = (iters = 8, pinEnd = false) => {
    for (let iter = 0; iter < iters; iter++) {
      for (const s of sticks) {
        const p1 = particles[s.a];
        const p2 = particles[s.b];
        const p1Fixed = p1.pinned || (pinEnd && s.a === SEGMENTS - 1);
        const p2Fixed = p2.pinned || (pinEnd && s.b === SEGMENTS - 1);
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const d = Math.hypot(dx, dy) || 1;
        const diff = (d - s.length) / d;
        const ox = dx * diff * 0.5;
        const oy = dy * diff * 0.5;
        if (p1Fixed && p2Fixed) continue;
        if (p1Fixed) {
          p2.x -= ox * 2;
          p2.y -= oy * 2;
        } else if (p2Fixed) {
          p1.x += ox * 2;
          p1.y += oy * 2;
        } else {
          p1.x += ox;
          p1.y += oy;
          p2.x -= ox;
          p2.y -= oy;
        }
      }
      const p0 = particles[0];
      p0.x = p0.initX;
      p0.y = p0.initY;
    }
  };

  const stepVerlet = (dt: number) => {
    const dts = Math.min(0.022, dt);
    for (const p of particles) {
      if (p.pinned) {
        p.x = p.initX;
        p.y = p.initY;
        p.prevX = p.x;
        p.prevY = p.y;
        continue;
      }
      if (dragging && p === particles[SEGMENTS - 1]) continue;
      const lx = p.x;
      const ly = p.y;
      const ax = 0;
      const ay = GRAVITY / p.mass;
      p.x = 2 * p.x - p.prevX + ax * dts * dts;
      p.y = 2 * p.y - p.prevY + ay * dts * dts;
      p.prevX = lx;
      p.prevY = ly;
    }
    solveSticks(dragging ? 10 : 6, dragging);
  };

  const hitBall = (x: number, y: number) => {
    const ball = particles[SEGMENTS - 1];
    return dist(ball.x, ball.y, x, y) < GRAB_R;
  };

  /** True when pointer is in the downward 180° arc from the anchor. */
  const inDownwardArc = (x: number, y: number) => {
    const a = anchor();
    return y >= a.y;
  };

  const maxCordLength = () => restLength + STRETCH_SLACK;

  const fireToggle = () => {
    if (hasTriggered) return;
    hasTriggered = true;
    on = !on;
    bloom = 1;
    audio.lampToggle(on, 0.95);
    haptics.pattern([0, 16, 30, 10]);
    // Snap impulse — release pulls the ball back up the cord
    const ball = particles[SEGMENTS - 1];
    const a = anchor();
    const d = dist(a.x, a.y, ball.x, ball.y) || 1;
    const nx = (a.x - ball.x) / d;
    const ny = (a.y - ball.y) / d;
    ball.prevX = ball.x - nx * 10;
    ball.prevY = ball.y - ny * 14;
    dragging = false;
  };

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    px = e.clientX;
    py = e.clientY;
    downX = px;
    downY = py;
    if (!hitBall(px, py)) return;
    dragging = true;
    hasTriggered = false;
  };
  const onMove = (e: PointerEvent) => {
    px = e.clientX;
    py = e.clientY;
  };
  const onUp = () => {
    if (!dragging) return;
    const moved = dist(downX, downY, px, py);
    // Tap on the ball — small downward yank then toggle (like the original)
    if (!hasTriggered && moved < 10) {
      const ball = particles[SEGMENTS - 1];
      for (let i = 1; i < SEGMENTS; i++) {
        particles[i].y += 6;
        particles[i].prevY = particles[i].y - 2;
      }
      ball.y += 8;
      fireToggle();
    }
    dragging = false;
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  return {
    update(dt: number) {
      lightBlend += ((on ? 1 : 0) - lightBlend) * Math.min(1, dt * 6);
      bloom = Math.max(0, bloom - dt * 1.4);

      const a = anchor();
      particles[0].initX = a.x;
      particles[0].initY = a.y;

      stepVerlet(dt);

      if (dragging) {
        const ball = particles[SEGMENTS - 1];
        const a0 = anchor();
        let tx = px;
        let ty = py;
        const d = dist(a0.x, a0.y, tx, ty);
        const maxLen = maxCordLength();

        // Hard max length — cord cannot extend forever
        if (d > maxLen) {
          // Snap-toggle only in the downward 180° arc when hitting the limit
          if (!hasTriggered && inDownwardArc(px, py)) {
            fireToggle();
          }
          const s = maxLen / d;
          tx = a0.x + (tx - a0.x) * s;
          ty = a0.y + (ty - a0.y) * s;
        }

        ball.x = tx;
        ball.y = ty;
        ball.prevX = tx;
        ball.prevY = ty;
        solveSticks(10, true);
      }

      // Room
      bg.clear();
      bg.rect(0, 0, w, h);
      bg.fill({ color: 0x12141a, alpha: 1 });
      if (lightBlend > 0.01) {
        bg.rect(0, 0, w, h);
        bg.fill({ color: 0x2a261c, alpha: lightBlend * 0.45 });
      }

      // Table under the lamp
      const tt = lampLayout.tableTop;
      const tcx = w * 0.5;
      const tableW = Math.min(w * 0.78, 520);
      const lip = Math.min(28, h * 0.035);
      tableG.clear();
      tableG.rect(0, tt + 8, w, h - tt);
      tableG.fill({ color: 0x0c0e12, alpha: 1 });
      tableG.moveTo(tcx - tableW * 0.5, tt);
      tableG.lineTo(tcx + tableW * 0.5, tt);
      tableG.lineTo(tcx + tableW * 0.46, tt + lip);
      tableG.lineTo(tcx - tableW * 0.46, tt + lip);
      tableG.closePath();
      tableG.fill({ color: 0x2a2218, alpha: 1 });
      tableG.moveTo(tcx - tableW * 0.5, tt);
      tableG.lineTo(tcx + tableW * 0.5, tt);
      tableG.lineTo(tcx + tableW * 0.46, tt + lip);
      tableG.lineTo(tcx - tableW * 0.46, tt + lip);
      tableG.closePath();
      tableG.stroke({ width: 1.5, color: 0x3d3428, alpha: 0.9 });
      tableG.ellipse(tcx, tt + 2, tableW * 0.42, 5);
      tableG.fill({ color: 0x3a3228, alpha: 0.55 + lightBlend * 0.25 });
      const legSpread = tableW * 0.38;
      const legH = Math.min(h * 0.18, 110);
      for (const side of [-1, 1]) {
        const lx = tcx + side * legSpread;
        tableG.rect(lx - 5, tt + lip, 10, legH);
        tableG.fill({ color: 0x1e1812, alpha: 1 });
      }
      const baseX = lampLayout.spriteX + LAMP_VB.w * lampLayout.scale * 0.66;
      tableG.ellipse(baseX, tt + 3, 48 * lampLayout.scale, 8);
      tableG.fill({ color: 0x000000, alpha: 0.35 });

      // Soft glow under the shade only — no expanding rings outside the lamp
      glow.clear();
      if (lightBlend > 0.04) {
        const bx = lampLayout.bulbX;
        const by = lampLayout.bulbY;
        const s = lampLayout.scale;
        // Tight glow tucked under the shade opening (lamp SVG draws on top)
        const glowR = 32 * s * (1 + bloom * 0.2);
        glow.circle(bx, by, glowR);
        glow.fill({ color: 0xfffa89, alpha: lightBlend * 0.35 + bloom * 0.2 });
        glow.circle(bx, by, glowR * 0.55);
        glow.fill({ color: 0xfffa89, alpha: lightBlend * 0.5 + bloom * 0.25 });
      }

      if (lampSprite) {
        lampSprite.alpha = 0.55 + lightBlend * 0.45;
        lampSprite.tint = on || lightBlend > 0.5 ? 0xffffff : 0x9a9a9a;
      }
      if (bulbSprite) {
        bulbSprite.visible = lightBlend > 0.08;
        // Toggle flash lives on the bulb itself (still behind the shade)
        const pulse = 1 + bloom * 0.35;
        bulbSprite.alpha = Math.min(1, lightBlend * 1.15 + bloom * 0.4);
        bulbSprite.scale.set(lampLayout.scale * 0.9 * pulse);
      } else {
        const s = lampLayout.scale * 180;
        tableG.moveTo(a.x - s * 0.6, lampLayout.spriteY);
        tableG.lineTo(a.x - s * 0.15, a.y);
        tableG.stroke({ width: 8, color: 0x343434, alpha: 1 });
        tableG.moveTo(lampLayout.bulbX - s * 0.55, lampLayout.bulbY - s * 0.15);
        tableG.lineTo(lampLayout.bulbX + s * 0.55, lampLayout.bulbY - s * 0.15);
        tableG.lineTo(lampLayout.bulbX + s * 0.7, lampLayout.bulbY + s * 0.25);
        tableG.lineTo(lampLayout.bulbX - s * 0.7, lampLayout.bulbY + s * 0.25);
        tableG.closePath();
        tableG.fill({ color: 0x343434, alpha: 1 });
      }

      // Cord + ball
      cordG.clear();
      for (const s of sticks) {
        const p1 = particles[s.a];
        const p2 = particles[s.b];
        cordG.moveTo(p1.x, p1.y);
        cordG.lineTo(p2.x, p2.y);
        cordG.stroke({ width: 2.25, color: CORD_COLOR, alpha: 0.95 });
      }
      const ball = particles[SEGMENTS - 1];
      // Stretch cue — ball slightly elongates when taut
      const stretch = Math.max(0, dist(a.x, a.y, ball.x, ball.y) - restLength);
      const squash = Math.min(1.25, 1 + stretch * 0.008);
      cordG.circle(ball.x + 1.5, ball.y + 2, BALL_R);
      cordG.fill({ color: 0x000000, alpha: 0.22 });
      cordG.ellipse(ball.x, ball.y, BALL_R * (2 - squash), BALL_R * squash);
      cordG.fill({ color: BALL_COLOR, alpha: 1 });
      cordG.circle(ball.x - 2.5, ball.y - 2.5, 3);
      cordG.fill({ color: 0xffffff, alpha: 0.35 });
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
      rebuildRope();
    },
    destroy() {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      layer.destroy({ children: true });
    },
  };
}

export const lampToggle: ExperienceModule = {
  id: "lamp-toggle",
  name: "Lamp Toggle",
  modality: "Toggle",
  tagline: "Pull the yellow ball — Verlet cord snaps the light.",
  hint: "Pull the cord down until it snaps. Tap the ball to toggle.",
  accent: "#f7bd32",
  mount,
};
