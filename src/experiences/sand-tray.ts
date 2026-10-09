import { createHud } from "@/engine/hud";
import type {
  ExperienceHandle,
  WebGLExperienceContext,
  WebGLExperienceModule,
} from "@/engine/types";

/**
 * Sand Tray — WebGL grains in a recessed basin.
 * Pour falls through the mouth and stacks on the floor inside the box.
 */

const TRAY_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const TRAY_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform vec4 uOuter;
uniform vec4 uInner;
uniform vec2 uMouth;
uniform float uTime;
out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  vec3 bg = vec3(0.05, 0.045, 0.04);
  bg += 0.012 * noise(px * 0.02);

  vec2 outerC = (uOuter.xy + uOuter.zw) * 0.5;
  vec2 outerH = (uOuter.zw - uOuter.xy) * 0.5;
  float outer = sdRoundBox(px - outerC, outerH, 28.0);

  vec2 innerC = (uInner.xy + uInner.zw) * 0.5;
  vec2 innerH = (uInner.zw - uInner.xy) * 0.5;
  float inner = sdRoundBox(px - innerC, innerH, 18.0);

  vec3 wood = vec3(0.34, 0.24, 0.15);
  wood += (noise(px * 0.03) - 0.5) * 0.06;
  vec3 rimHi = vec3(0.62, 0.48, 0.3);
  float rim = smoothstep(8.0, -2.0, outer) * smoothstep(-6.0, 10.0, inner);
  vec3 col = bg;
  col = mix(col, wood, smoothstep(1.5, -1.0, outer));
  col = mix(col, rimHi, rim * 0.65);

  vec3 cavity = vec3(0.11, 0.09, 0.07);
  float depth = clamp((px.y - uInner.y) / max(1.0, uInner.w - uInner.y), 0.0, 1.0);
  cavity += vec3(0.05, 0.04, 0.02) * (1.0 - depth);
  cavity += (noise(px * 0.08) - 0.5) * 0.03;
  col = mix(col, cavity, smoothstep(1.0, -1.5, inner));

  float lip = smoothstep(uInner.y - 6.0, uInner.y + 10.0, px.y) * smoothstep(uInner.y + 22.0, uInner.y + 4.0, px.y);
  float inMouth = step(uMouth.x, px.x) * step(px.x, uMouth.y);
  col += vec3(0.08, 0.06, 0.03) * lip * (1.0 - inMouth);

  float floorShade = smoothstep(uInner.w - 36.0, uInner.w, px.y);
  col *= 1.0 - floorShade * 0.25 * smoothstep(0.0, -2.0, inner);

  outColor = vec4(col, 1.0);
}
`;

const GRAIN_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in float aSize;
layout(location=2) in float aShade;
uniform vec2 uRes;
uniform float uDpr;
out float vShade;
void main() {
  vec2 clip = vec2(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = aSize * uDpr;
  vShade = aShade;
}
`;

const GRAIN_FRAG = `#version 300 es
precision highp float;
in float vShade;
out vec4 outColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  float rim = smoothstep(1.0, 0.55, d);
  vec3 sand = mix(vec3(0.42, 0.3, 0.15), vec3(0.9, 0.74, 0.44), vShade);
  sand *= 0.72 + rim * 0.38;
  sand += vec3(0.22, 0.16, 0.07) * (1.0 - d) * 0.35;
  outColor = vec4(sand, 1.0);
}
`;

type Grain = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  shade: number;
  alive: boolean;
};

type Tray = {
  outerLeft: number;
  outerRight: number;
  outerTop: number;
  outerBottom: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  floor: number;
  mouthLeft: number;
  mouthRight: number;
};

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(log || "shader compile failed");
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader) {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(log || "program link failed");
  }
  return prog;
}

function mount(ctx: WebGLExperienceContext): ExperienceHandle {
  const { canvas, gl, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const hud = createHud(ctx.host);
  let pouring = true;

  const vs = compile(gl, gl.VERTEX_SHADER, TRAY_VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, TRAY_FRAG);
  const trayProg = link(gl, vs, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  const gvs = compile(gl, gl.VERTEX_SHADER, GRAIN_VERT);
  const gfs = compile(gl, gl.FRAGMENT_SHADER, GRAIN_FRAG);
  const grainProg = link(gl, gvs, gfs);
  gl.deleteShader(gvs);
  gl.deleteShader(gfs);

  const quad = gl.createVertexArray()!;
  gl.bindVertexArray(quad);
  const quadBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const MAX = 5200;
  const grains: Grain[] = [];
  const drawData = new Float32Array(MAX * 4);
  const grainVao = gl.createVertexArray()!;
  const grainBuf = gl.createBuffer()!;
  gl.bindVertexArray(grainVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, grainBuf);
  gl.bufferData(gl.ARRAY_BUFFER, drawData.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 8);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 16, 12);
  gl.bindVertexArray(null);

  const trayLoc = {
    res: gl.getUniformLocation(trayProg, "uRes"),
    outer: gl.getUniformLocation(trayProg, "uOuter"),
    inner: gl.getUniformLocation(trayProg, "uInner"),
    mouth: gl.getUniformLocation(trayProg, "uMouth"),
    time: gl.getUniformLocation(trayProg, "uTime"),
  };
  const grainLoc = {
    res: gl.getUniformLocation(grainProg, "uRes"),
    dpr: gl.getUniformLocation(grainProg, "uDpr"),
  };

  const CELL = 7;
  let hashW = 64;
  let hashH = 64;
  const buckets: number[][] = [];
  const contacts = new Uint8Array(MAX);

  function tray(): Tray {
    const margin = Math.min(64, w * 0.07);
    const outerLeft = margin;
    const outerRight = w - margin;
    const outerTop = h * 0.3;
    const outerBottom = h - Math.max(72, h * 0.08);
    const lip = Math.min(36, w * 0.035);
    return {
      outerLeft,
      outerRight,
      outerTop,
      outerBottom,
      innerLeft: outerLeft + lip,
      innerRight: outerRight - lip,
      innerTop: outerTop + lip * 0.85,
      floor: outerBottom - lip * 0.7,
      mouthLeft: w * 0.3,
      mouthRight: w * 0.7,
    };
  }

  function spawnGrain(t: Tray, x?: number, y?: number, inAir = false): Grain {
    const span = t.innerRight - t.innerLeft;
    return {
      x: x ?? t.innerLeft + Math.random() * span,
      y: y ?? (inAir ? -12 : t.floor - Math.random() * (t.floor - t.innerTop) * 0.45),
      vx: (Math.random() - 0.5) * (inAir ? 36 : 12),
      vy: inAir ? 70 + Math.random() * 50 : 0,
      r: 1.95 + Math.random() * 0.55,
      shade: 0.28 + Math.random() * 0.72,
      alive: true,
    };
  }

  const SAND_SESSION_KEY = "palmstone:sand-tray-session";

  function packBed(t: Tray) {
    const baseR = 2.12;
    const dx = baseR * 1.76;
    const dy = baseR * 1.52;
    const bedTop = t.floor - Math.min(132, (t.floor - t.innerTop) * 0.46);
    let row = 0;
    for (let y = t.floor - baseR; y > bedTop && grains.length < MAX; y -= dy, row++) {
      const xOff = (row % 2) * dx * 0.5;
      for (let x = t.innerLeft + baseR + 1 + xOff; x < t.innerRight - baseR - 1; x += dx) {
        if (grains.length >= MAX) return;
        grains.push({
          x: x + (Math.random() - 0.5) * 0.28,
          y: y + (Math.random() - 0.5) * 0.2,
          vx: 0,
          vy: 0,
          r: 1.9 + Math.random() * 0.5,
          shade: 0.28 + Math.random() * 0.72,
          alive: true,
        });
      }
    }
  }

  function fillBed() {
    grains.length = 0;
    const t = tray();
    try {
      const raw = sessionStorage.getItem(SAND_SESSION_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { x: number; y: number; r: number; shade: number }[];
        for (const g of saved.slice(0, MAX)) {
          grains.push({
            x: g.x,
            y: g.y,
            vx: 0,
            vy: 0,
            r: Math.max(1.7, g.r),
            shade: g.shade,
            alive: true,
          });
        }
        if (grains.length > 500) {
          relax(t, 10);
          return;
        }
      }
    } catch {
      /* ignore corrupt session sand */
    }
    packBed(t);
    relax(t, 12);
  }

  hud.toggle("Pouring", "Pour", true, (on) => {
    pouring = on;
    void audio.resume();
    haptics.tap(8);
  });
  let grainScale = 1;
  let pourEvery = 0.018;
  hud.slider("Grain", 0.6, 2.2, grainScale, (v) => {
    const k = v / grainScale;
    grainScale = v;
    for (const grain of grains) grain.r *= k;
  });
  hud.slider("Flow", 0.25, 1, 0.82, (v) => {
    pourEvery = 0.055 - v * 0.045;
  });
  hud.button("Reset", () => {
    fillBed();
    void audio.resume();
    audio.grain(0.45, 0.55);
    haptics.tap(12);
  });

  let pointerDown = false;
  let px = 0;
  let py = 0;
  let pvx = 0;
  let pvy = 0;
  let lastPx = 0;
  let lastPy = 0;
  let fallAcc = 0;
  let scrapeAcc = 0;
  let pourAcc = 0;
  let time = 0;

  const toLocal = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / Math.max(rect.width, 1)) * w,
      y: ((clientY - rect.top) / Math.max(rect.height, 1)) * h,
    };
  };

  const onDown = (e: PointerEvent) => {
    pointerDown = true;
    const p = toLocal(e.clientX, e.clientY);
    px = lastPx = p.x;
    py = lastPy = p.y;
    void audio.resume();
    haptics.tap(8);
  };
  const onMove = (e: PointerEvent) => {
    const p = toLocal(e.clientX, e.clientY);
    px = p.x;
    py = p.y;
  };
  const onUp = () => {
    pointerDown = false;
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  canvas.style.touchAction = "none";

  function confineGrain(g: Grain, t: Tray) {
    const inMouth = g.x > t.mouthLeft && g.x < t.mouthRight;
    const crossingLip = g.y > t.outerTop && g.y < t.innerTop + 8;
    if (crossingLip && !inMouth) {
      g.y = t.outerTop - g.r;
      g.vy *= -0.15;
      g.vx += g.x < t.mouthLeft ? -40 : 40;
    }

    const inside =
      g.y >= t.innerTop && g.x > t.innerLeft - 4 && g.x < t.innerRight + 4;
    if (inside) {
      if (g.x < t.innerLeft + g.r) {
        g.x = t.innerLeft + g.r;
        g.vx = Math.abs(g.vx) * 0.2;
      } else if (g.x > t.innerRight - g.r) {
        g.x = t.innerRight - g.r;
        g.vx = -Math.abs(g.vx) * 0.2;
      }
      if (g.y > t.floor - g.r) {
        g.y = t.floor - g.r;
        if (g.vy > 0) g.vy *= -0.08;
        g.vx *= 0.72;
        return true;
      }
    } else if (g.y > t.innerTop) {
      if (g.x < t.outerLeft) {
        g.x = t.outerLeft;
        g.vx *= -0.3;
      } else if (g.x > t.outerRight) {
        g.x = t.outerRight;
        g.vx *= -0.3;
      }
    }
    return false;
  }

  function rebuildHash(t: Tray) {
    hashW = Math.max(12, Math.ceil(w / CELL) + 2);
    hashH = Math.max(12, Math.ceil(h / CELL) + 2);
    const n = hashW * hashH;
    while (buckets.length < n) buckets.push([]);
    for (let i = 0; i < n; i++) buckets[i].length = 0;
    for (let i = 0; i < grains.length; i++) {
      const g = grains[i];
      if (!g.alive) continue;
      const cx = Math.max(0, Math.min(hashW - 1, (g.x / CELL) | 0));
      const cy = Math.max(0, Math.min(hashH - 1, (g.y / CELL) | 0));
      buckets[cy * hashW + cx].push(i);
    }
    void t;
  }

  function separatePair(a: Grain, b: Grain) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const min = a.r + b.r;
    const d2 = dx * dx + dy * dy;
    if (d2 > min * min || d2 < 1e-8) return false;
    const dist = Math.sqrt(d2);
    const overlap = min - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    const wa = b.r * b.r;
    const wb = a.r * a.r;
    const sum = wa + wb;
    // Positional correction only — avoid injecting velocity when nearly settled.
    a.x -= nx * overlap * (wa / sum);
    a.y -= ny * overlap * (wa / sum);
    b.x += nx * overlap * (wb / sum);
    b.y += ny * overlap * (wb / sum);
    const rvx = a.vx - b.vx;
    const rvy = a.vy - b.vy;
    const vn = rvx * nx + rvy * ny;
    const slow = Math.abs(a.vx) + Math.abs(a.vy) + Math.abs(b.vx) + Math.abs(b.vy) < 40;
    if (vn > 0) {
      const rest = vn * (slow ? 0.92 : 0.55);
      a.vx -= rest * nx;
      a.vy -= rest * ny;
      b.vx += rest * nx;
      b.vy += rest * ny;
    }
    if (!slow) {
      const tx = -ny;
      const ty = nx;
      const vt = rvx * tx + rvy * ty;
      const friction = vt * 0.22;
      a.vx -= friction * tx;
      a.vy -= friction * ty;
      b.vx += friction * tx;
      b.vy += friction * ty;
    } else {
      a.vx *= 0.5;
      a.vy *= 0.5;
      b.vx *= 0.5;
      b.vy *= 0.5;
    }
    return true;
  }

  function collideGrains() {
    for (let i = 0; i < grains.length; i++) {
      const g = grains[i];
      if (!g.alive) continue;
      const cx = Math.max(0, Math.min(hashW - 1, (g.x / CELL) | 0));
      const cy = Math.max(0, Math.min(hashH - 1, (g.y / CELL) | 0));
      for (let oy = -1; oy <= 1; oy++) {
        const ry = cy + oy;
        if (ry < 0 || ry >= hashH) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const rx = cx + ox;
          if (rx < 0 || rx >= hashW) continue;
          const cell = buckets[ry * hashW + rx];
          for (let k = 0; k < cell.length; k++) {
            const j = cell[k];
            if (j <= i) continue;
            if (separatePair(g, grains[j])) {
              contacts[i] = 1;
              contacts[j] = 1;
            }
          }
        }
      }
    }
  }

  function avalanche(t: Tray) {
    const repose = 1.35;
    for (let i = 0; i < grains.length; i++) {
      if (!contacts[i]) continue;
      const g = grains[i];
      if (g.y < t.innerTop || Math.abs(g.vy) > 90) continue;
      const cx = Math.max(0, Math.min(hashW - 1, (g.x / CELL) | 0));
      const cy = Math.max(0, Math.min(hashH - 1, (g.y / CELL) | 0));
      let supportL = 0;
      let supportR = 0;
      for (let oy = 0; oy <= 1; oy++) {
        const ry = cy + oy;
        if (ry < 0 || ry >= hashH) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const rx = cx + ox;
          if (rx < 0 || rx >= hashW) continue;
          const cell = buckets[ry * hashW + rx];
          for (let k = 0; k < cell.length; k++) {
            const o = grains[cell[k]];
            if (o === g) continue;
            const dx = o.x - g.x;
            const dy = o.y - g.y;
            if (dy < g.r * 0.15 || Math.abs(dx) > g.r * 2.2) continue;
            if (dx < 0) supportL += 1;
            else supportR += 1;
          }
        }
      }
      const floorSupport = g.y > t.floor - g.r * 1.35;
      if (floorSupport) continue;
      if (supportL + supportR < 1) continue;
      if (supportL > supportR * repose) g.vx += 28;
      else if (supportR > supportL * repose) g.vx -= 28;
    }
  }

  function relax(t: Tray, iters: number) {
    for (let n = 0; n < iters; n++) {
      contacts.fill(0);
      rebuildHash(t);
      collideGrains();
      for (let i = 0; i < grains.length; i++) confineGrain(grains[i], t);
    }
  }

  fillBed();

  function deepestIndex(t: Tray) {
    let best = -1;
    let bestY = -Infinity;
    for (let i = 0; i < grains.length; i++) {
      const g = grains[i];
      if (!g.alive) return i;
      if (g.y > t.innerTop && g.vy < 30 && g.y > bestY) {
        bestY = g.y;
        best = i;
      }
    }
    return best;
  }

  return {
    update(dt: number) {
      time += dt;
      const t = tray();
      const airDamp = Math.pow(0.992, dt * 60);
      const restDamp = Math.pow(0.78, dt * 60);
      pvx = (px - lastPx) / Math.max(dt, 0.001);
      pvy = (py - lastPy) / Math.max(dt, 0.001);
      lastPx = px;
      lastPy = py;

      if (pouring) {
        fallAcc += dt;
        while (fallAcc > pourEvery) {
          fallAcc -= pourEvery;
          const x = (t.mouthLeft + t.mouthRight) * 0.5 + (Math.random() - 0.5) * (t.mouthRight - t.mouthLeft) * 0.45;
          if (grains.length < MAX) {
            grains.push(spawnGrain(t, x, -8 - Math.random() * 24, true));
          } else {
            const idx = deepestIndex(t);
            if (idx >= 0) {
              const g0 = grains[idx];
              g0.x = x;
              g0.y = -8 - Math.random() * 24;
              g0.vx = (Math.random() - 0.5) * 30;
              g0.vy = 60 + Math.random() * 40;
              g0.alive = true;
            }
          }
        }
        pourAcc += dt;
        if (pourAcc > 0.14) {
          audio.grain(0.12, 0.42);
          pourAcc = 0;
        }
      }

      const brushR = 52;
      let moved = 0;
      contacts.fill(0);
      const disturb = pointerDown || pouring;
      for (let i = 0; i < grains.length; i++) {
        const grain = grains[i];
        const asleep =
          !disturb &&
          grain.vx === 0 &&
          grain.vy === 0 &&
          grain.y > t.innerTop + grain.r;
        if (asleep) continue;
        grain.vy += 760 * dt;
        if (pointerDown) {
          const dx = grain.x - px;
          const dy = grain.y - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < brushR * brushR && grain.y > t.outerTop - 20) {
            const d = Math.sqrt(d2) || 1;
            const push = (1 - d / brushR) * 2.2;
            grain.vx += (pvx * 0.18 + (dx / d) * 70) * push * dt * 60;
            grain.vy += (pvy * 0.12 + (dy / d) * 36) * push * dt * 60;
            moved += push;
          }
        }
        grain.vx *= airDamp;
        grain.vy *= airDamp;
        grain.x += grain.vx * dt;
        grain.y += grain.vy * dt;
      }

      // Fewer collision passes when idle — resting piles shouldn't churn.
      if (disturb) {
        const iters = pointerDown ? 4 : 3;
        for (let n = 0; n < iters; n++) {
          rebuildHash(t);
          collideGrains();
          for (let i = 0; i < grains.length; i++) {
            if (confineGrain(grains[i], t)) contacts[i] = 1;
          }
        }
        avalanche(t);
        for (let i = 0; i < grains.length; i++) {
          const g = grains[i];
          if (!contacts[i]) continue;
          g.vx *= restDamp;
          g.vy *= restDamp;
          if (Math.abs(g.vx) < 8) g.vx = 0;
          if (Math.abs(g.vy) < 10) g.vy = 0;
        }
      } else {
        // Idle: one soft settle pass only for grains that still have velocity.
        let anyAwake = false;
        for (let i = 0; i < grains.length; i++) {
          if (grains[i].vx !== 0 || grains[i].vy !== 0) {
            anyAwake = true;
            break;
          }
        }
        if (anyAwake) {
          rebuildHash(t);
          collideGrains();
          for (let i = 0; i < grains.length; i++) {
            confineGrain(grains[i], t);
            const g = grains[i];
            g.vx *= restDamp;
            g.vy *= restDamp;
            if (Math.abs(g.vx) < 8) g.vx = 0;
            if (Math.abs(g.vy) < 10) g.vy = 0;
          }
        }
      }

      scrapeAcc += moved * dt;
      if (pointerDown && scrapeAcc > 0.28) {
        const speed = Math.min(1, Math.hypot(pvx, pvy) / 800);
        audio.grain(0.22 + speed * 0.5, 0.65 + speed * 0.45);
        if (speed > 0.2) haptics.tap(6);
        scrapeAcc = 0;
      }

      const dpr = canvas.height / Math.max(h, 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.BLEND);
      gl.useProgram(trayProg);
      gl.uniform2f(trayLoc.res, w, h);
      gl.uniform4f(trayLoc.outer, t.outerLeft, t.outerTop, t.outerRight, t.outerBottom);
      gl.uniform4f(trayLoc.inner, t.innerLeft, t.innerTop, t.innerRight, t.floor);
      gl.uniform2f(trayLoc.mouth, t.mouthLeft, t.mouthRight);
      gl.uniform1f(trayLoc.time, time);
      gl.bindVertexArray(quad);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);

      let n = 0;
      for (let i = 0; i < grains.length && n < MAX; i++) {
        const g = grains[i];
        if (g.y < -30 || g.y > h + 10) continue;
        const o = n * 4;
        drawData[o] = g.x;
        drawData[o + 1] = g.y;
        drawData[o + 2] = g.r * 2.08;
        drawData[o + 3] = g.shade;
        n += 1;
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(grainProg);
      gl.uniform2f(grainLoc.res, w, h);
      gl.uniform1f(grainLoc.dpr, dpr);
      gl.bindVertexArray(grainVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, grainBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, drawData.subarray(0, n * 4));
      gl.drawArrays(gl.POINTS, 0, n);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    },
    resize(nw: number, nh: number) {
      w = nw;
      h = nh;
    },
    destroy() {
      try {
        const payload = grains
          .filter((g) => g.alive)
          .slice(0, 900)
          .map((g) => ({ x: g.x, y: g.y, r: g.r, shade: g.shade }));
        sessionStorage.setItem(SAND_SESSION_KEY, JSON.stringify(payload));
      } catch {
        /* quota */
      }
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      hud.destroy();
      gl.deleteProgram(trayProg);
      gl.deleteProgram(grainProg);
      gl.deleteBuffer(quadBuf);
      gl.deleteBuffer(grainBuf);
      gl.deleteVertexArray(quad);
      gl.deleteVertexArray(grainVao);
    },
  };
}

export const sandTray: WebGLExperienceModule = {
  id: "sand-tray",
  collection: "studio",
  kind: "webgl",
  name: "Sand Tray",
  modality: "Granular",
  tagline: "Pour, rake, pile — grain weight under the thumb.",
  hint: "Sand falls into the tray. Drag to rake. Pour starts on.",
  accent: "#c4a574",
  badge: "WebGL",
  mount,
};
