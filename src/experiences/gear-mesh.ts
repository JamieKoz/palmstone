import { Container, Graphics } from "pixi.js";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Gear = {
  x: number;
  y: number;
  r: number;
  teeth: number;
  angle: number;
  prevTooth: number;
  omega: number;
  mesh: number[];
};

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);

  const gears: Gear[] = [];

  function build() {
    gears.length = 0;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const specs = [
      { x: cx - 78, y: cy, r: 78, teeth: 16 },
      { x: cx + 62, y: cy - 8, r: 52, teeth: 12 },
      { x: cx + 18, y: cy + 96, r: 44, teeth: 10 },
      { x: cx - 148, y: cy - 78, r: 40, teeth: 9 },
      { x: cx + 142, y: cy + 58, r: 36, teeth: 8 },
    ];
    for (const s of specs) {
      gears.push({ ...s, angle: 0, prevTooth: 0, omega: 0, mesh: [] });
    }
    for (let i = 0; i < gears.length; i++) {
      for (let j = i + 1; j < gears.length; j++) {
        const d = Math.hypot(gears[i].x - gears[j].x, gears[i].y - gears[j].y);
        if (Math.abs(d - (gears[i].r + gears[j].r)) < 18) {
          gears[i].mesh.push(j);
          gears[j].mesh.push(i);
        }
      }
    }
  }
  build();

  let drag: number | null = null;
  let lastAngle = 0;
  let px = 0;
  let py = 0;

  const crankPos = (gear: Gear) => {
    const a = gear.angle;
    return {
      x: gear.x + Math.cos(a) * gear.r * 0.48,
      y: gear.y + Math.sin(a) * gear.r * 0.48,
    };
  };

  const hit = (x: number, y: number) => {
    for (let i = 0; i < gears.length; i++) {
      const c = crankPos(gears[i]);
      if (Math.hypot(c.x - x, c.y - y) < 22) return i;
    }
    for (let i = 0; i < gears.length; i++) {
      if (Math.hypot(gears[i].x - x, gears[i].y - y) < gears[i].r * 0.78) return i;
    }
    return null;
  };

  const onDown = (e: PointerEvent) => {
    px = e.clientX;
    py = e.clientY;
    drag = hit(px, py);
    void audio.resume();
    if (drag != null) {
      lastAngle = Math.atan2(py - gears[drag].y, px - gears[drag].x);
      haptics.tap(10);
    }
  };
  const onMove = (e: PointerEvent) => {
    px = e.clientX;
    py = e.clientY;
  };
  const onUp = () => {
    drag = null;
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  function propagate(source: number, omega: number, visited: Set<number>) {
    visited.add(source);
    for (const j of gears[source].mesh) {
      if (visited.has(j)) continue;
      const ratio = -gears[source].teeth / gears[j].teeth;
      gears[j].omega = omega * ratio;
      propagate(j, gears[j].omega, visited);
    }
  }

  return {
    update(dt: number) {
      if (drag != null) {
        const gear = gears[drag];
        const ang = Math.atan2(py - gear.y, px - gear.x);
        let dAng = ang - lastAngle;
        if (dAng > Math.PI) dAng -= Math.PI * 2;
        if (dAng < -Math.PI) dAng += Math.PI * 2;
        gear.omega = Math.max(-14, Math.min(14, dAng / Math.max(dt, 0.001)));
        lastAngle = ang;
        propagate(drag, gear.omega, new Set());
      } else {
        for (const gear of gears) gear.omega *= Math.pow(0.988, dt * 60);
        let maxI = 0;
        for (let i = 1; i < gears.length; i++) {
          if (Math.abs(gears[i].omega) > Math.abs(gears[maxI].omega)) maxI = i;
        }
        if (Math.abs(gears[maxI].omega) > 0.04) {
          propagate(maxI, gears[maxI].omega, new Set());
        }
      }

      let clicks = 0;
      let loud = 0;
      for (const gear of gears) {
        gear.angle += gear.omega * dt;
        const step = (Math.PI * 2) / gear.teeth;
        const tooth = Math.floor(gear.angle / step);
        if (tooth !== gear.prevTooth && Math.abs(gear.omega) > 0.45) {
          clicks += 1;
          loud = Math.max(loud, Math.min(1, Math.abs(gear.omega) / 8));
        }
        gear.prevTooth = tooth;
      }

      if (clicks > 0) {
        audio.click(0.18 + loud * 0.42, 0.85 + Math.random() * 0.25);
        if (loud > 0.35) haptics.tap(6);
      }

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x161410, alpha: 1 });

      for (const gear of gears) {
        drawGear(g, gear);
        const crank = crankPos(gear);
        g.circle(crank.x, crank.y, drag != null && gears[drag] === gear ? 11 : 8);
        g.fill({ color: 0xe7d7b4, alpha: 1 });
        g.circle(crank.x, crank.y, 3.5);
        g.fill({ color: 0x2a241c, alpha: 1 });
      }
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
      build();
    },
    destroy() {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      layer.destroy({ children: true });
    },
  };
}

function drawGear(g: Graphics, gear: Gear) {
  const pitch = (Math.PI * 2) / gear.teeth;
  const half = pitch * 0.34;
  g.moveTo(
    gear.x + Math.cos(gear.angle - half) * gear.r * 0.78,
    gear.y + Math.sin(gear.angle - half) * gear.r * 0.78,
  );
  for (let t = 0; t < gear.teeth; t++) {
    const a = gear.angle + t * pitch;
    const base = gear.r * 0.78;
    const tip = gear.r + 8;
    g.lineTo(gear.x + Math.cos(a - half * 0.35) * base, gear.y + Math.sin(a - half * 0.35) * base);
    g.lineTo(gear.x + Math.cos(a - half * 0.55) * tip, gear.y + Math.sin(a - half * 0.55) * tip);
    g.lineTo(gear.x + Math.cos(a + half * 0.55) * tip, gear.y + Math.sin(a + half * 0.55) * tip);
    g.lineTo(gear.x + Math.cos(a + half * 0.35) * base, gear.y + Math.sin(a + half * 0.35) * base);
  }
  g.closePath();
  g.fill({ color: 0xc4b08a, alpha: 1 });
  g.circle(gear.x, gear.y, gear.r * 0.62);
  g.fill({ color: 0x3a342c, alpha: 1 });
  g.circle(gear.x, gear.y, gear.r * 0.62);
  g.stroke({ width: 2, color: 0xd8c8a4, alpha: 0.85 });
  g.circle(gear.x, gear.y, 9);
  g.fill({ color: 0x1c1814, alpha: 1 });
}

export const gearMesh: ExperienceModule = {
  id: "gear-mesh",
  collection: "field",
  name: "Gear Mesh",
  modality: "Mechanical",
  tagline: "Turn a crank — teeth mesh, click, and coast.",
  hint: "Grab a pale crank or the gear body. Spin and let it coast.",
  accent: "#c4b08a",
  mount,
};
