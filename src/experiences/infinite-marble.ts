import { createHud } from "@/engine/hud";
import { clearWorld, loadWorld, saveWorld } from "@/engine/worldState";
import type {
  ExperienceHandle,
  WebGLExperienceContext,
  WebGLExperienceModule,
} from "@/engine/types";

const ID = "infinite-marble";
const MAX_RAILS = 24;
const MAX_MARBLES = 18;
const THICK = 9;
const MAX_RAIL_VERTS = 8000;

type Pt = { nx: number; ny: number };
type Rail = { pts: Pt[] };
type Marble = { nx: number; ny: number; vx: number; vy: number; hue: number };
type MarbleWorld = { rails: Rail[]; marbles: Marble[] };

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aNrm;
uniform vec2 uRes;
uniform float uKind;
uniform float uDpr;
out vec2 vNrm;
void main() {
  vNrm = aNrm;
  vec2 clip = vec2(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = uKind > 0.5 ? 18.0 * uDpr : 1.0;
}
`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vNrm;
uniform float uKind;
uniform vec3 uColor;
out vec4 outColor;
void main() {
  if (uKind < 0.5) {
    float lit = 0.45 + 0.55 * clamp(0.5 + vNrm.y * 0.8, 0.0, 1.0);
    vec3 col = vec3(0.38, 0.46, 0.56) * lit;
    col += vec3(0.75, 0.82, 0.9) * pow(lit, 6.0) * 0.25;
    outColor = vec4(col, 1.0);
  } else {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = dot(p, p);
    if (d > 1.0) discard;
    float z = sqrt(max(0.0, 1.0 - d));
    vec3 n = normalize(vec3(p.x, p.y, z));
    float ndl = clamp(dot(n, normalize(vec3(-0.35, -0.5, 0.8))), 0.0, 1.0);
    vec3 col = uColor * (0.28 + ndl * 0.85);
    col += vec3(1.0) * pow(ndl, 18.0) * 0.55;
    outColor = vec4(col, 1.0);
  }
}
`;

const BG_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const BG_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 col = mix(vec3(0.05, 0.07, 0.1), vec3(0.08, 0.1, 0.14), vUv.y);
  outColor = vec4(col, 1.0);
}
`;

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

function hsl(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

function mount(ctx: WebGLExperienceContext): ExperienceHandle {
  const { canvas, gl, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const saved = loadWorld<MarbleWorld>(ID);
  const rails: Rail[] = saved?.rails?.slice(0, MAX_RAILS) ?? [];
  const marbles: Marble[] = saved?.marbles?.slice(0, MAX_MARBLES) ?? [];

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = link(gl, vs, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  const bvs = compile(gl, gl.VERTEX_SHADER, BG_VERT);
  const bfs = compile(gl, gl.FRAGMENT_SHADER, BG_FRAG);
  const bgProg = link(gl, bvs, bfs);
  gl.deleteShader(bvs);
  gl.deleteShader(bfs);

  const bgVao = gl.createVertexArray()!;
  gl.bindVertexArray(bgVao);
  const bgBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const railData = new Float32Array(MAX_RAIL_VERTS * 4);
  const railVao = gl.createVertexArray()!;
  const railBuf = gl.createBuffer()!;
  gl.bindVertexArray(railVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, railBuf);
  gl.bufferData(gl.ARRAY_BUFFER, railData.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
  gl.bindVertexArray(null);

  const marbleData = new Float32Array(MAX_MARBLES * 4);
  const marbleVao = gl.createVertexArray()!;
  const marbleBuf = gl.createBuffer()!;
  gl.bindVertexArray(marbleVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, marbleBuf);
  gl.bufferData(gl.ARRAY_BUFFER, marbleData.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
  gl.bindVertexArray(null);

  const loc = {
    res: gl.getUniformLocation(prog, "uRes"),
    kind: gl.getUniformLocation(prog, "uKind"),
    color: gl.getUniformLocation(prog, "uColor"),
    dpr: gl.getUniformLocation(prog, "uDpr"),
  };

  let pointer = false;
  let drawing: Pt[] | null = null;
  let px = 0;
  let py = 0;
  let moved = 0;
  let dirty = false;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let bounceAcc = 0;

  const persist = () => {
    saveWorld<MarbleWorld>(ID, {
      rails: rails.map((r) => ({ pts: r.pts.map((p) => ({ ...p })) })),
      marbles: marbles.map((m) => ({ ...m })),
    });
    dirty = false;
  };
  const scheduleSave = () => {
    dirty = true;
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      persist();
    }, 1400);
  };

  const dropMarble = (x: number, y: number) => {
    if (marbles.length >= MAX_MARBLES) marbles.shift();
    marbles.push({ nx: x / w, ny: y / h, vx: 0, vy: 20, hue: Math.random() });
    audio.click(0.35, 1.1);
    haptics.tap(8);
    scheduleSave();
  };

  const toLocal = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / Math.max(rect.width, 1)) * w,
      y: ((clientY - rect.top) / Math.max(rect.height, 1)) * h,
    };
  };

  const onDown = (e: PointerEvent) => {
    pointer = true;
    const p = toLocal(e.clientX, e.clientY);
    px = p.x;
    py = p.y;
    moved = 0;
    drawing = [{ nx: px / w, ny: py / h }];
    void audio.resume();
  };
  const onMove = (e: PointerEvent) => {
    if (!pointer || !drawing) return;
    const p = toLocal(e.clientX, e.clientY);
    moved += Math.hypot(p.x - px, p.y - py);
    px = p.x;
    py = p.y;
    const last = drawing[drawing.length - 1];
    if (Math.hypot(px - last.nx * w, py - last.ny * h) > 10) {
      drawing.push({ nx: px / w, ny: py / h });
    }
  };
  const onUp = () => {
    if (!pointer) return;
    if (moved < 14) dropMarble(px, py);
    else if (drawing && drawing.length >= 2) {
      if (rails.length >= MAX_RAILS) rails.shift();
      rails.push({ pts: drawing });
      audio.grain(0.2, 0.5);
      haptics.tap(5);
      scheduleSave();
    }
    drawing = null;
    pointer = false;
  };

  const hud = createHud(ctx.host);
  hud.button("Clear run", () => {
    rails.length = 0;
    marbles.length = 0;
    drawing = null;
    clearWorld(ID);
    audio.whoosh(0.2);
  });

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  canvas.style.touchAction = "none";

  const collide = (m: Marble) => {
    const x = m.nx * w;
    const y = m.ny * h;
    const r = 8;
    let hx = x;
    let hy = y;
    for (const rail of rails) {
      for (let i = 1; i < rail.pts.length; i++) {
        const ax = rail.pts[i - 1].nx * w;
        const ay = rail.pts[i - 1].ny * h;
        const bx = rail.pts[i].nx * w;
        const by = rail.pts[i].ny * h;
        const abx = bx - ax;
        const aby = by - ay;
        const len2 = abx * abx + aby * aby || 1;
        let t = ((x - ax) * abx + (y - ay) * aby) / len2;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + abx * t;
        const cy = ay + aby * t;
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy);
        const min = r + THICK * 0.48;
        if (dist < min && dist > 0.001) {
          const nx = dx / dist;
          const ny = dy / dist;
          const push = min - dist;
          hx += nx * push;
          hy += ny * push;
          const vn = m.vx * nx + m.vy * ny;
          if (vn < 0) {
            m.vx -= vn * nx * 1.72;
            m.vy -= vn * ny * 1.72;
            bounceAcc += Math.min(1, -vn / 280);
          }
          m.vx *= 0.995;
        }
      }
    }
    m.nx = hx / w;
    m.ny = hy / h;
  };

  function tessellate(pts: Pt[], into: Float32Array, start: number) {
    let n = start;
    if (pts.length < 2) return n;
    const write = (x: number, y: number, sx: number, sy: number) => {
      if (n >= MAX_RAIL_VERTS) return;
      const o = n * 4;
      into[o] = x;
      into[o + 1] = y;
      into[o + 2] = sx;
      into[o + 3] = sy;
      n += 1;
    };
    if (n > 0) {
      const prev = (n - 1) * 4;
      write(into[prev], into[prev + 1], into[prev + 2], into[prev + 3]);
    }
    for (let i = 1; i < pts.length && n + 4 < MAX_RAIL_VERTS; i++) {
      const ax = pts[i - 1].nx * w;
      const ay = pts[i - 1].ny * h;
      const bx = pts[i].nx * w;
      const by = pts[i].ny * h;
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * THICK * 0.5;
      const ny = (dx / len) * THICK * 0.5;
      if (i === 1 && n > start) write(ax - nx, ay - ny, -nx, -ny);
      write(ax - nx, ay - ny, -nx, -ny);
      write(ax + nx, ay + ny, nx, ny);
      write(bx - nx, by - ny, -nx, -ny);
      write(bx + nx, by + ny, nx, ny);
    }
    return n;
  }

  return {
    update(dt: number) {
      for (const m of marbles) {
        m.vy += 560 * dt;
        m.nx += (m.vx * dt) / w;
        m.ny += (m.vy * dt) / h;
        collide(m);
        if (m.ny > 1.08 || m.nx < -0.08 || m.nx > 1.08) {
          m.nx = Math.max(0.08, Math.min(0.92, m.nx));
          m.ny = 0.06;
          m.vx *= 0.2;
          m.vy = 30;
        }
      }
      if (bounceAcc > 0.55) {
        audio.click(0.18, 1.4);
        haptics.tap(3);
        bounceAcc = 0;
        scheduleSave();
      }

      let rv = 0;
      for (const rail of rails) rv = tessellate(rail.pts, railData, rv);
      if (drawing) rv = tessellate(drawing, railData, rv);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.BLEND);
      gl.useProgram(bgProg);
      gl.bindVertexArray(bgVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.useProgram(prog);
      gl.uniform2f(loc.res, w, h);
      gl.uniform1f(loc.dpr, canvas.height / Math.max(h, 1));
      gl.uniform1f(loc.kind, 0);
      gl.uniform3f(loc.color, 0.4, 0.5, 0.6);
      if (rv >= 3) {
        gl.bindVertexArray(railVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, railBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, railData.subarray(0, rv * 4));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, rv);
      }

      gl.uniform1f(loc.kind, 1);
      gl.bindVertexArray(marbleVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, marbleBuf);
      for (const m of marbles) {
        const rgb = hsl(m.hue, 0.5, 0.58);
        gl.uniform3f(loc.color, rgb[0], rgb[1], rgb[2]);
        marbleData[0] = m.nx * w;
        marbleData[1] = m.ny * h;
        marbleData[2] = 0;
        marbleData[3] = 0;
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, marbleData.subarray(0, 4));
        gl.drawArrays(gl.POINTS, 0, 1);
      }
      gl.bindVertexArray(null);
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    destroy() {
      if (saveTimer) clearTimeout(saveTimer);
      if (dirty || rails.length || marbles.length) persist();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      hud.destroy();
      gl.deleteProgram(prog);
      gl.deleteProgram(bgProg);
      gl.deleteBuffer(bgBuf);
      gl.deleteBuffer(railBuf);
      gl.deleteBuffer(marbleBuf);
      gl.deleteVertexArray(bgVao);
      gl.deleteVertexArray(railVao);
      gl.deleteVertexArray(marbleVao);
    },
  };
}

export const infiniteMarble: WebGLExperienceModule = {
  id: "infinite-marble",
  collection: "field",
  kind: "webgl",
  name: "Infinite Marble",
  modality: "Path",
  tagline: "Draw a run. Drop marbles. Keep building the run.",
  hint: "Drag to draw a rail. Tap to drop a marble.",
  accent: "#8aa4c8",
  badge: "World",
  mount,
};
