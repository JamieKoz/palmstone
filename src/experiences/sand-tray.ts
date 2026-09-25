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
  float light = smoothstep(1.0, 0.15, d);
  vec3 sand = mix(vec3(0.45, 0.32, 0.16), vec3(0.86, 0.7, 0.4), vShade);
  sand += vec3(0.25, 0.18, 0.08) * (1.0 - d) * 0.45;
  float a = light * 0.95;
  outColor = vec4(sand, a);
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

  const MAX = 4200;
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

  const COLS = 80;
  const columns: number[][] = Array.from({ length: COLS }, () => []);

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
      r: 1.6 + Math.random() * 1.5,
      shade: 0.35 + Math.random() * 0.65,
      alive: true,
    };
  }

  function fillBed() {
    grains.length = 0;
    const t = tray();
    for (let i = 0; i < 1600; i++) grains.push(spawnGrain(t));
  }
  fillBed();

  hud.toggle("Pouring", "Pour", true, (on) => {
    pouring = on;
    void audio.resume();
    haptics.tap(8);
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

  function colOf(x: number, t: Tray) {
    const u = (x - t.innerLeft) / Math.max(1, t.innerRight - t.innerLeft);
    return Math.max(0, Math.min(COLS - 1, Math.floor(u * COLS)));
  }

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
      const damp = Math.pow(0.9, dt * 60);
      pvx = (px - lastPx) / Math.max(dt, 0.001);
      pvy = (py - lastPy) / Math.max(dt, 0.001);
      lastPx = px;
      lastPy = py;

      if (pouring) {
        fallAcc += dt;
        while (fallAcc > 0.018) {
          fallAcc -= 0.018;
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
      for (const grain of grains) {
        grain.vy += 520 * dt;
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
        grain.vx *= damp;
        grain.vy *= damp;
        grain.x += grain.vx * dt;
        grain.y += grain.vy * dt;

        const inMouth = grain.x > t.mouthLeft && grain.x < t.mouthRight;
        const crossingLip = grain.y > t.outerTop && grain.y < t.innerTop + 8;
        if (crossingLip && !inMouth) {
          grain.y = t.outerTop - grain.r;
          grain.vy *= -0.2;
          grain.vx += grain.x < t.mouthLeft ? -40 : 40;
        }

        const inside =
          grain.y >= t.innerTop &&
          grain.x > t.innerLeft - 4 &&
          grain.x < t.innerRight + 4;
        if (inside) {
          if (grain.x < t.innerLeft + grain.r) {
            grain.x = t.innerLeft + grain.r;
            grain.vx = Math.abs(grain.vx) * 0.25;
          } else if (grain.x > t.innerRight - grain.r) {
            grain.x = t.innerRight - grain.r;
            grain.vx = -Math.abs(grain.vx) * 0.25;
          }
          if (grain.y > t.floor - grain.r) {
            grain.y = t.floor - grain.r;
            grain.vy *= -0.12;
            grain.vx *= 0.7;
          }
        } else if (grain.y > t.innerTop) {
          if (grain.x < t.outerLeft) {
            grain.x = t.outerLeft;
            grain.vx *= -0.3;
          } else if (grain.x > t.outerRight) {
            grain.x = t.outerRight;
            grain.vx *= -0.3;
          }
        }
      }

      for (const col of columns) col.length = 0;
      for (let i = 0; i < grains.length; i++) {
        const g = grains[i];
        if (g.y < t.innerTop || g.x < t.innerLeft || g.x > t.innerRight) continue;
        columns[colOf(g.x, t)].push(i);
      }
      for (const col of columns) {
        col.sort((a, b) => grains[b].y - grains[a].y);
        let surface = t.floor;
        for (const idx of col) {
          const g = grains[idx];
          if (g.vy > 180) continue;
          const rest = surface - g.r;
          if (g.y > rest) {
            g.y = rest;
            g.vy *= 0.05;
            g.vx *= 0.82;
          }
          surface = Math.min(surface, g.y - g.r * 0.55);
          if (surface < t.innerTop + 8) surface = t.innerTop + 8;
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
        drawData[o + 2] = g.r * 2.4;
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
