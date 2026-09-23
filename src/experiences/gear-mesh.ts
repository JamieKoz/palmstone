import { Container, Graphics } from "pixi.js";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Gear = {
  x: number;
  y: number;
  r: number;
  teeth: number;
  angle: number;
  omega: number;
  mesh: number[]; // indices of meshed gears
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
      { x: cx - 70, y: cy, r: 70, teeth: 16 },
      { x: cx + 55, y: cy - 10, r: 48, teeth: 12 },
      { x: cx + 20, y: cy + 85, r: 40, teeth: 10 },
      { x: cx - 130, y: cy - 70, r: 36, teeth: 9 },
      { x: cx + 130, y: cy + 50, r: 32, teeth: 8 },
    ];
    for (const s of specs) {
      gears.push({ ...s, angle: 0, omega: 0, mesh: [] });
    }
    // mesh by proximity
    for (let i = 0; i < gears.length; i++) {
      for (let j = i + 1; j < gears.length; j++) {
        const d = Math.hypot(gears[i].x - gears[j].x, gears[i].y - gears[j].y);
        if (Math.abs(d - (gears[i].r + gears[j].r)) < 14) {
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
  let clickPhase = 0;

  const hit = (x: number, y: number) => {
    for (let i = 0; i < gears.length; i++) {
      if (Math.hypot(gears[i].x - x, gears[i].y - y) < gears[i].r + 8) return i;
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
        gear.omega = dAng / Math.max(dt, 0.001);
        lastAngle = ang;
        propagate(drag, gear.omega, new Set());
      } else {
        for (const gear of gears) gear.omega *= Math.pow(0.96, dt * 60);
        // keep mesh consistent from fastest
        let maxI = 0;
        for (let i = 1; i < gears.length; i++) {
          if (Math.abs(gears[i].omega) > Math.abs(gears[maxI].omega)) maxI = i;
        }
        if (Math.abs(gears[maxI].omega) > 0.05) {
          propagate(maxI, gears[maxI].omega, new Set());
        }
      }

      for (const gear of gears) {
        gear.angle += gear.omega * dt;
      }

      const spin = Math.abs(gears.reduce((s, g) => s + g.omega, 0));
      clickPhase += spin * dt;
      if (clickPhase > 0.55) {
        audio.click(0.22 + Math.min(0.4, spin * 0.02), 0.9 + Math.random() * 0.2);
        haptics.tap(5);
        clickPhase = 0;
      }

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x161410, alpha: 1 });

      for (const gear of gears) {
        const teeth = gear.teeth;
        g.circle(gear.x, gear.y, gear.r * 0.72);
        g.fill({ color: 0x3a342c, alpha: 1 });
        g.circle(gear.x, gear.y, gear.r * 0.72);
        g.stroke({ width: 2, color: 0xb8a078, alpha: 0.9 });

        for (let t = 0; t < teeth; t++) {
          const a = gear.angle + (t / teeth) * Math.PI * 2;
          const x0 = gear.x + Math.cos(a) * gear.r * 0.62;
          const y0 = gear.y + Math.sin(a) * gear.r * 0.62;
          const x1 = gear.x + Math.cos(a) * (gear.r + 6);
          const y1 = gear.y + Math.sin(a) * (gear.r + 6);
          g.moveTo(x0, y0);
          g.lineTo(x1, y1);
          g.stroke({ width: 5, color: 0xc4b08a, alpha: 0.95 });
        }
        g.circle(gear.x, gear.y, 8);
        g.fill({ color: 0x1c1814, alpha: 1 });
        g.circle(gear.x, gear.y, 8);
        g.stroke({ width: 2, color: 0xd4c4a0, alpha: 0.8 });
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

export const gearMesh: ExperienceModule = {
  id: "gear-mesh",
  name: "Gear Mesh",
  modality: "Mechanical",
  tagline: "Interlocking gears — spin cascade, soft click.",
  hint: "Drag a gear to spin the mesh.",
  accent: "#c4b08a",
  mount,
};
