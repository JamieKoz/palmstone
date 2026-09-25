import { Container, Graphics, Text } from "pixi.js";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

/** Six faces with distinct micro-interactions. */
type FaceId = 0 | 1 | 2 | 3 | 4 | 5;

const FACE_COLORS = [0xc45a4a, 0x6a9aaa, 0xc4a574, 0x8fbc8f, 0xa89a84, 0x8aa4c8];
const FACE_NAMES = ["Click", "Switch", "Dial", "Stick", "Gear", "Soft"];
const SIDE_FACES: FaceId[] = [0, 1, 2, 3];

type DragMode = "none" | "click" | "switch" | "dial" | "stick" | "gear" | "soft" | "arrow";

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);
  const labelText = new Text({
    text: FACE_NAMES[0],
    style: {
      fontFamily: "system-ui, sans-serif",
      fontSize: 13,
      fill: 0xe7e2d6,
      fontWeight: "600",
      letterSpacing: 1,
    },
  });
  labelText.anchor.set(0.5);
  layer.addChild(labelText);

  let sideIndex = 0;
  let elevation: "side" | "top" | "bottom" = "side";
  let face: FaceId = 0;
  let displayRot = 0;
  let targetDisplayRot = 0;
  let flip = 0;
  let targetFlip = 0;

  let clickPress = 0;
  let switchOn = false;
  let switchT = 0;
  let dial = 0;
  let stickX = 0;
  let stickY = 0;
  let gearAngle = 0;
  let softPress = 0;
  let bloom = 0;
  let arrowFlash: "left" | "right" | "up" | "down" | null = null;
  let arrowFlashT = 0;

  let dragMode: DragMode = "none";
  let lastX = 0;
  let lastY = 0;
  let lastAngle = 0;
  let startX = 0;
  let startY = 0;
  let dragMoved = false;

  const size = () => Math.min(w, h) * 0.34;
  const arrowPad = () => Math.min(56, Math.min(w, h) * 0.1);

  const syncFace = () => {
    if (elevation === "top") face = 4;
    else if (elevation === "bottom") face = 5;
    else face = SIDE_FACES[sideIndex];
  };

  const faceRect = () => {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const s = size();
    const skewX = Math.sin(displayRot) * 0.12;
    const skewY = flip * 0.1;
    const fx0 = cx - s * 0.7 + skewX * s;
    const fy0 = cy - s * 0.7 + skewY * s;
    return {
      cx,
      cy,
      s,
      fx0,
      fy0,
      fw: s * 1.4,
      fh: s * 1.4,
      icx: fx0 + s * 0.7,
      icy: fy0 + s * 0.7,
    };
  };

  const hitArrow = (x: number, y: number): "left" | "right" | "up" | "down" | null => {
    const pad = arrowPad();
    const cx = w * 0.5;
    const cy = h * 0.5;
    if (x < pad * 1.35 && Math.abs(y - cy) < pad * 1.8) return "left";
    if (x > w - pad * 1.35 && Math.abs(y - cy) < pad * 1.8) return "right";
    if (y < pad * 1.5 + 48 && Math.abs(x - cx) < pad * 1.8) return "up";
    if (y > h - pad * 1.5 && Math.abs(x - cx) < pad * 1.8) return "down";
    return null;
  };

  const hitFace = (x: number, y: number) => {
    const { fx0, fy0, fw, fh } = faceRect();
    return x >= fx0 && x <= fx0 + fw && y >= fy0 && y <= fy0 + fh;
  };

  const rotate = (dir: "left" | "right" | "up" | "down") => {
    arrowFlash = dir;
    arrowFlashT = 1;
    if (dir === "left") {
      if (elevation !== "side") elevation = "side";
      else sideIndex = (sideIndex + 3) % 4;
      targetDisplayRot -= Math.PI / 2;
      targetFlip = 0;
    } else if (dir === "right") {
      if (elevation !== "side") elevation = "side";
      else sideIndex = (sideIndex + 1) % 4;
      targetDisplayRot += Math.PI / 2;
      targetFlip = 0;
    } else if (dir === "up") {
      if (elevation === "bottom") {
        elevation = "side";
        targetFlip = 0;
      } else if (elevation === "side") {
        elevation = "top";
        targetFlip = 1;
      }
    } else if (dir === "down") {
      if (elevation === "top") {
        elevation = "side";
        targetFlip = 0;
      } else if (elevation === "side") {
        elevation = "bottom";
        targetFlip = -1;
      }
    }
    syncFace();
    audio.click(0.28, 1.15);
    haptics.tap(9);
    bloom = 0.7;
  };

  const beginFaceDrag = (x: number, y: number) => {
    const { icx, icy, s } = faceRect();
    lastX = x;
    lastY = y;
    startX = x;
    startY = y;
    dragMoved = false;
    lastAngle = Math.atan2(y - icy, x - icx);
    bloom = 1;

    switch (face) {
      case 0:
        dragMode = "click";
        clickPress = 1;
        audio.click(0.7, 1);
        haptics.tap(14);
        break;
      case 1:
        dragMode = "switch";
        break;
      case 2:
        dragMode = "dial";
        break;
      case 3:
        dragMode = "stick";
        stickX = Math.max(-1, Math.min(1, ((x - icx) / s) * 1.8));
        stickY = Math.max(-1, Math.min(1, ((y - icy) / s) * 1.8));
        audio.grain(0.2, 1.1);
        haptics.tap(5);
        break;
      case 4:
        dragMode = "gear";
        break;
      case 5:
        dragMode = "soft";
        softPress = 1;
        audio.pulse(0.45);
        haptics.pattern([0, 18]);
        break;
    }
  };

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    const arrow = hitArrow(e.clientX, e.clientY);
    if (arrow) {
      dragMode = "arrow";
      rotate(arrow);
      return;
    }
    if (!hitFace(e.clientX, e.clientY)) {
      dragMode = "none";
      return;
    }
    beginFaceDrag(e.clientX, e.clientY);
  };

  const onMove = (e: PointerEvent) => {
    if (dragMode === "none" || dragMode === "arrow" || dragMode === "click") return;
    const { icx, icy, s } = faceRect();
    const x = e.clientX;
    const y = e.clientY;
    if (Math.hypot(x - startX, y - startY) > 8) dragMoved = true;

    if (dragMode === "switch") {
      const dy = y - lastY;
      if (Math.abs(dy) > 8) {
        const next = dy < 0;
        if (next !== switchOn) {
          switchOn = next;
          audio.switchClick(switchOn, 0.75);
          haptics.pattern([0, 14]);
        }
        lastY = y;
      }
    } else if (dragMode === "dial") {
      const a = Math.atan2(y - icy, x - icx);
      let da = a - lastAngle;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      dial += da;
      lastAngle = a;
      if (Math.abs(da) > 0.04) {
        audio.click(0.22, 0.85 + (Math.abs(dial) % 1) * 0.35);
        haptics.tap(5);
      }
    } else if (dragMode === "stick") {
      stickX = Math.max(-1, Math.min(1, ((x - icx) / s) * 1.8));
      stickY = Math.max(-1, Math.min(1, ((y - icy) / s) * 1.8));
      if (Math.hypot(x - lastX, y - lastY) > 10) {
        audio.grain(0.15, 1);
        lastX = x;
        lastY = y;
      }
    } else if (dragMode === "gear") {
      const a = Math.atan2(y - icy, x - icx);
      let da = a - lastAngle;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      gearAngle += da;
      lastAngle = a;
      if (Math.abs(da) > 0.08) {
        audio.click(0.28, 1.25);
        haptics.tap(6);
      }
    } else if (dragMode === "soft") {
      softPress = Math.min(1, softPress + 0.08);
    }
  };

  const onUp = () => {
    if (dragMode === "switch" && !dragMoved) {
      switchOn = !switchOn;
      audio.switchClick(switchOn, 0.75);
      haptics.pattern([0, 14]);
    }
    if (dragMode === "click") clickPress = 0;
    if (dragMode === "soft") softPress = 0;
    dragMode = "none";
    dragMoved = false;
  };

  const el = ctx.app.canvas;
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";
  syncFace();

  const drawArrow = (
    ax: number,
    ay: number,
    dir: "left" | "right" | "up" | "down",
    active: boolean,
  ) => {
    const r = arrowPad() * 0.42;
    g.circle(ax, ay, r * 1.15);
    g.fill({ color: 0x000000, alpha: active ? 0.45 : 0.28 });
    g.circle(ax, ay, r * 1.15);
    g.stroke({
      width: 1.5,
      color: FACE_COLORS[face],
      alpha: active ? 0.9 : 0.35,
    });
    const s = r * 0.45;
    if (dir === "left") {
      g.moveTo(ax + s * 0.35, ay - s);
      g.lineTo(ax - s * 0.55, ay);
      g.lineTo(ax + s * 0.35, ay + s);
      g.stroke({ width: 2.5, color: 0xe7e2d6, alpha: active ? 0.95 : 0.55 });
    } else if (dir === "right") {
      g.moveTo(ax - s * 0.35, ay - s);
      g.lineTo(ax + s * 0.55, ay);
      g.lineTo(ax - s * 0.35, ay + s);
      g.stroke({ width: 2.5, color: 0xe7e2d6, alpha: active ? 0.95 : 0.55 });
    } else if (dir === "up") {
      g.moveTo(ax - s, ay + s * 0.35);
      g.lineTo(ax, ay - s * 0.55);
      g.lineTo(ax + s, ay + s * 0.35);
      g.stroke({ width: 2.5, color: 0xe7e2d6, alpha: active ? 0.95 : 0.55 });
    } else {
      g.moveTo(ax - s, ay - s * 0.35);
      g.lineTo(ax, ay + s * 0.55);
      g.lineTo(ax + s, ay - s * 0.35);
      g.stroke({ width: 2.5, color: 0xe7e2d6, alpha: active ? 0.95 : 0.55 });
    }
  };

  return {
    update(dt: number) {
      displayRot += (targetDisplayRot - displayRot) * Math.min(1, dt * 10);
      flip += (targetFlip - flip) * Math.min(1, dt * 10);
      switchT += ((switchOn ? 1 : 0) - switchT) * Math.min(1, dt * 14);
      if (dragMode !== "click") clickPress = Math.max(0, clickPress - dt * 5);
      if (dragMode !== "soft") softPress = Math.max(0, softPress - dt * 3.5);
      if (dragMode !== "stick") {
        stickX *= Math.exp(-dt * 2.2);
        stickY *= Math.exp(-dt * 2.2);
      }
      bloom = Math.max(0, bloom - dt * 1.8);
      arrowFlashT = Math.max(0, arrowFlashT - dt * 2.8);
      if (arrowFlashT <= 0) arrowFlash = null;

      const { cx, cy, s, fx0, fy0, fw, fh, icx, icy } = faceRect();
      const depth = s * 0.2;
      const skewX = Math.sin(displayRot) * 0.12;
      const skewY = flip * 0.1;

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x121416, alpha: 1 });

      g.moveTo(cx + s * (0.7 + skewX), cy - s * 0.7 + skewY * s);
      g.lineTo(cx + s * (0.7 + skewX) + depth, cy - s * 0.5 + skewY * s);
      g.lineTo(cx + s * (0.7 + skewX) + depth, cy + s * 0.9 + skewY * s);
      g.lineTo(cx + s * (0.7 + skewX), cy + s * 0.7 + skewY * s);
      g.closePath();
      g.fill({ color: 0x2a3038, alpha: 0.95 });

      g.moveTo(cx - s * 0.7 + skewX * s, cy - s * 0.7 + skewY * s);
      g.lineTo(cx + s * 0.7 + skewX * s, cy - s * 0.7 + skewY * s);
      g.lineTo(cx + s * 0.7 + skewX * s + depth, cy - s * 0.5 + skewY * s);
      g.lineTo(cx - s * 0.7 + skewX * s + depth, cy - s * 0.5 + skewY * s);
      g.closePath();
      g.fill({ color: 0x3a424c, alpha: 0.9 });

      g.roundRect(fx0, fy0, fw, fh, 18);
      g.fill({ color: FACE_COLORS[face], alpha: 0.92 });
      g.roundRect(fx0, fy0, fw, fh, 18);
      g.stroke({ width: 2, color: 0xffffff, alpha: 0.18 });

      if (face === 0) {
        const pr = s * 0.22 * (1 - clickPress * 0.2);
        g.circle(icx, icy + clickPress * 4, pr);
        g.fill({ color: 0x1a1a1a, alpha: 0.35 });
        g.circle(icx, icy + clickPress * 4, pr * 0.72);
        g.fill({ color: 0xffffff, alpha: 0.55 });
      } else if (face === 1) {
        g.roundRect(icx - s * 0.12, icy - s * 0.28, s * 0.24, s * 0.56, 8);
        g.fill({ color: 0x1a1a1a, alpha: 0.4 });
        const ly = icy + (0.5 - switchT) * s * 0.32;
        g.roundRect(icx - s * 0.14, ly - s * 0.12, s * 0.28, s * 0.24, 6);
        g.fill({ color: 0xf0f0e8, alpha: 0.95 });
      } else if (face === 2) {
        g.circle(icx, icy, s * 0.32);
        g.stroke({ width: 4, color: 0x1a1a1a, alpha: 0.35 });
        g.moveTo(icx, icy);
        g.lineTo(icx + Math.cos(dial) * s * 0.28, icy + Math.sin(dial) * s * 0.28);
        g.stroke({ width: 4, color: 0xffffff, alpha: 0.7 });
        g.circle(icx, icy, s * 0.08);
        g.fill({ color: 0xffffff, alpha: 0.8 });
      } else if (face === 3) {
        g.circle(icx, icy, s * 0.28);
        g.fill({ color: 0x1a1a1a, alpha: 0.3 });
        g.circle(icx + stickX * s * 0.16, icy + stickY * s * 0.16, s * 0.12);
        g.fill({ color: 0xffffff, alpha: 0.75 });
      } else if (face === 4) {
        const teeth = 10;
        for (let i = 0; i < teeth; i++) {
          const a0 = gearAngle + (i / teeth) * Math.PI * 2;
          const a1 = a0 + Math.PI / teeth;
          g.moveTo(icx + Math.cos(a0) * s * 0.18, icy + Math.sin(a0) * s * 0.18);
          g.lineTo(icx + Math.cos(a0) * s * 0.32, icy + Math.sin(a0) * s * 0.32);
          g.lineTo(icx + Math.cos(a1) * s * 0.32, icy + Math.sin(a1) * s * 0.32);
          g.lineTo(icx + Math.cos(a1) * s * 0.18, icy + Math.sin(a1) * s * 0.18);
          g.fill({ color: 0x1a1a1a, alpha: 0.45 });
        }
        g.circle(icx, icy, s * 0.12);
        g.fill({ color: 0xffffff, alpha: 0.5 });
      } else {
        const pr = s * 0.3 * (1 + softPress * 0.15);
        g.circle(icx, icy, pr);
        g.fill({ color: 0xffffff, alpha: 0.25 + softPress * 0.25 });
      }

      if (bloom > 0.05) {
        g.roundRect(fx0 - 4, fy0 - 4, fw + 8, fh + 8, 20);
        g.stroke({ width: 2, color: 0xffffff, alpha: bloom * 0.4 });
      }

      // Face name chip
      const labelW = Math.max(72, 24 + FACE_NAMES[face].length * 8);
      g.roundRect(cx - labelW / 2, cy + s * 0.95, labelW, 28, 14);
      g.fill({ color: 0x000000, alpha: 0.45 });
      labelText.text = FACE_NAMES[face];
      labelText.position.set(cx, cy + s * 0.95 + 14);

      for (let i = 0; i < 6; i++) {
        g.circle(cx - 50 + i * 20, h * 0.9, i === face ? 5 : 3.5);
        g.fill({ color: FACE_COLORS[i], alpha: i === face ? 0.95 : 0.35 });
      }

      const pad = arrowPad();
      drawArrow(pad * 0.85, cy, "left", arrowFlash === "left");
      drawArrow(w - pad * 0.85, cy, "right", arrowFlash === "right");
      drawArrow(cx, pad * 0.95 + 52, "up", arrowFlash === "up");
      drawArrow(cx, h - pad * 0.95, "down", arrowFlash === "down");
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    destroy() {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      layer.destroy({ children: true });
    },
  };
}

export const fidgetCube: ExperienceModule = {
  id: "fidget-cube",
  collection: "field",
  name: "Fidget Cube",
  modality: "Fidget",
  tagline: "Play the face — arrows flip to click, switch, dial, stick, gear, soft.",
  hint: "Drag the face to play. Use the arrows to rotate.",
  accent: "#c45a4a",
  mount,
};
