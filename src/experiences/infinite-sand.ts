import { createHud } from "@/engine/hud";
import { clearWorld, loadWorld, saveWorld } from "@/engine/worldState";
import type {
  ExperienceHandle,
  WebGLExperienceContext,
  WebGLExperienceModule,
} from "@/engine/types";

/**
 * Infinite Sand — a dune field that stays as you leave it.
 * Interactivity is pile/carve; untampered sand should already read as sand.
 */

const ID = "infinite-sand";
const COLS = 256;
const ROWS = 160;
const WORLD_VER = 5;

type SandWorld = { v?: number; heights: string };

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uHeight;
uniform vec2 uRes;
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; }
  return v;
}

void main() {
  vec2 texel = 1.0 / vec2(textureSize(uHeight, 0));
  float z = texture(uHeight, vUv).r;
  float zx = texture(uHeight, vUv + vec2(texel.x, 0.0)).r;
  float zy = texture(uHeight, vUv + vec2(0.0, texel.y)).r;

  // Soft daylight on cool sand — not lava / burning dunes.
  float slope = length(vec2(z - zx, z - zy));
  vec3 nrm = normalize(vec3((z - zx) * 16.0, 1.15, (z - zy) * 14.0));
  vec3 light = normalize(vec3(-0.35, 0.88, 0.32));
  float ndl = clamp(dot(nrm, light), 0.0, 1.0);
  float hemi = 0.55 + 0.45 * nrm.y;

  // Cool beige / taupe sand (avoid hot orange).
  vec3 deep = vec3(0.42, 0.38, 0.3);
  vec3 mid = vec3(0.72, 0.66, 0.52);
  vec3 crest = vec3(0.88, 0.84, 0.72);
  vec3 col = mix(deep, mid, smoothstep(0.15, 0.55, z));
  col = mix(col, crest, smoothstep(0.5, 0.9, z) * ndl * 0.7);

  // Fine grit, muted.
  vec2 gUv = vUv * uRes;
  float g1 = noise(gUv * 1.2);
  float g2 = noise(gUv * 2.5 + 19.0);
  float g3 = hash(floor(gUv + vec2(g1 * 2.0, g2 * 2.0)));
  float speck = g1 * 0.45 + g2 * 0.35 + g3 * 0.2;
  col *= 0.86 + speck * 0.22;
  col += vec3(0.08, 0.07, 0.05) * step(0.93, g3);
  col -= vec3(0.05, 0.045, 0.035) * step(speck, 0.28);

  float rip = sin(gUv.x * 0.14 + gUv.y * 0.04 + fbm(vUv * 3.0) * 5.0);
  col += vec3(0.03, 0.028, 0.02) * rip * (0.25 + slope * 1.5);

  col *= 0.58 + ndl * 0.32 + hemi * 0.18;
  // Very soft highlight — not a hot specular burn.
  col += crest * pow(ndl, 16.0) * 0.04 * smoothstep(0.45, 0.9, z);

  float ao = 0.82 + 0.18 * smoothstep(0.12, 0.55, z);
  col *= ao;

  outColor = vec4(col, 1.0);
}
`;

function pack(heights: Float32Array) {
  const bytes = new Uint8Array(heights.length);
  for (let i = 0; i < heights.length; i++) {
    bytes[i] = Math.max(0, Math.min(255, Math.round(heights[i] * 255)));
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function unpack(raw: string, into: Float32Array) {
  try {
    const bin = atob(raw);
    if (bin.length !== into.length) return false;
    for (let i = 0; i < bin.length; i++) into[i] = bin.charCodeAt(i) / 255;
    return true;
  } catch {
    return false;
  }
}

function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise2(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm2(x: number, y: number) {
  let v = 0;
  let a = 0.5;
  let fx = x;
  let fy = y;
  for (let i = 0; i < 5; i++) {
    v += a * noise2(fx, fy);
    fx *= 2.05;
    fy *= 2.05;
    a *= 0.5;
  }
  return v;
}

/** Natural-looking dune bed — readable sand before any touch. */
function seedDunes(heights: Float32Array) {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const u = x / COLS;
      const v = y / ROWS;
      // Broad dune ridges + finer wind ripples + micro roughness.
      const dunes =
        fbm2(u * 2.6, v * 2.0) * 0.55 +
        fbm2(u * 6.5 + 20, v * 5.2) * 0.22 +
        Math.sin(u * 11.0 + fbm2(u * 2, v * 2) * 3.0) * 0.06 * Math.sin(v * 7.0);
      const grit = (hash2(x * 0.37, y * 0.41) - 0.5) * 0.04;
      heights[y * COLS + x] = Math.max(0.06, Math.min(0.92, 0.28 + dunes + grit));
    }
  }
}

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

  const heights = new Float32Array(COLS * ROWS);
  const pixels = new Uint8Array(COLS * ROWS * 4);
  const saved = loadWorld<SandWorld>(ID);
  if (saved?.v !== WORLD_VER || !saved.heights || !unpack(saved.heights, heights)) {
    seedDunes(heights);
  }

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = link(gl, vs, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, COLS, ROWS, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  const loc = {
    height: gl.getUniformLocation(prog, "uHeight"),
    res: gl.getUniformLocation(prog, "uRes"),
  };

  let pointer = false;
  let px = 0;
  let py = 0;
  let grainAcc = 0;
  let dirty = false;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let brush = 1;
  let pile = 1;

  const persist = () => {
    saveWorld<SandWorld>(ID, { v: WORLD_VER, heights: pack(heights) });
    dirty = false;
  };
  const scheduleSave = () => {
    dirty = true;
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      persist();
    }, 1600);
  };

  const toLocal = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / Math.max(rect.width, 1)) * w,
      y: ((clientY - rect.top) / Math.max(rect.height, 1)) * h,
    };
  };

  const stamp = (cx: number, cy: number, amount: number) => {
    const gx = (cx / w) * (COLS - 1);
    const gy = (1 - cy / h) * (ROWS - 1);
    const rad = 6.8 * brush;
    const x0 = Math.max(0, Math.floor(gx - rad));
    const x1 = Math.min(COLS - 1, Math.ceil(gx + rad));
    const y0 = Math.max(0, Math.floor(gy - rad));
    const y1 = Math.min(ROWS - 1, Math.ceil(gy + rad));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - gx, y - gy);
        if (d > rad) continue;
        const fall = (1 - d / rad) ** 2;
        const i = y * COLS + x;
        heights[i] = Math.max(0, Math.min(1, heights[i] + amount * fall));
      }
    }
    scheduleSave();
  };

  const avalanche = () => {
    const repose = 0.022;
    for (let y = ROWS - 2; y >= 0; y--) {
      for (let x = 0; x < COLS; x++) {
        const lower = y * COLS + x;
        const upper = lower + COLS;
        const diff = heights[upper] - heights[lower];
        if (diff > repose) {
          const move = (diff - repose) * 0.24;
          heights[upper] -= move;
          heights[lower] += move;
        }
      }
    }
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS - 1; x++) {
        const i = y * COLS + x;
        const diff = heights[i] - heights[i + 1];
        if (Math.abs(diff) > repose) {
          const move = (diff - Math.sign(diff) * repose) * 0.18;
          heights[i] -= move;
          heights[i + 1] += move;
        }
      }
    }
  };

  const upload = () => {
    for (let i = 0; i < heights.length; i++) {
      const v = Math.round(heights[i] * 255);
      const o = i * 4;
      pixels[o] = v;
      pixels[o + 1] = v;
      pixels[o + 2] = v;
      pixels[o + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, COLS, ROWS, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  };

  const onDown = (e: PointerEvent) => {
    pointer = true;
    const p = toLocal(e.clientX, e.clientY);
    px = p.x;
    py = p.y;
    void audio.resume();
    stamp(px, py, 0.18 * pile);
    haptics.tap(5);
  };
  const onMove = (e: PointerEvent) => {
    if (!pointer) return;
    const p = toLocal(e.clientX, e.clientY);
    px = p.x;
    py = p.y;
    stamp(px, py, 0.12 * pile);
  };
  const onUp = () => {
    pointer = false;
  };

  const hud = createHud(ctx.host);
  hud.slider("Brush", 0.6, 2.2, brush, (v) => {
    brush = v;
  });
  hud.toggle("Piling", "Carving", true, (on) => {
    pile = on ? 1 : -1;
  });
  hud.button("Reseed", () => {
    seedDunes(heights);
    clearWorld(ID);
    audio.whoosh(0.2);
    scheduleSave();
  });

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  canvas.style.touchAction = "none";
  upload();

  return {
    update(dt: number) {
      avalanche();
      if (pointer) {
        grainAcc += dt;
        if (grainAcc > 0.08) {
          audio.grain(0.22, 0.5);
          haptics.tap(3);
          grainAcc = 0;
        }
      }
      upload();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.BLEND);
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc.height, 0);
      gl.uniform2f(loc.res, w, h);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    destroy() {
      if (saveTimer) clearTimeout(saveTimer);
      if (dirty) persist();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      hud.destroy();
      gl.deleteProgram(prog);
      gl.deleteTexture(tex);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
    },
  };
}

export const infiniteSand: WebGLExperienceModule = {
  id: "infinite-sand",
  collection: "field",
  kind: "webgl",
  name: "Infinite Sand",
  modality: "Terrain",
  tagline: "Every gesture changes the dunes. The terrain stays.",
  hint: "Drag to pile and rake. The field never resets.",
  accent: "#c4a574",
  badge: "World",
  mount,
};
