import { getSharedAudio } from "@/engine/audio";
import { createHud } from "@/engine/hud";
import { clearWorld, loadWorld, saveWorld } from "@/engine/worldState";
import type {
  ExperienceHandle,
  WebGLExperienceContext,
  WebGLExperienceModule,
} from "@/engine/types";

/**
 * Rain Glass — photo-like rain on a window pane.
 * Organic metaball beads with lens highlights. Trails = discrete micro-drops.
 * Tiny drops cling. Mass slides down, catches others, coalesces, races.
 * Drag only sideways or down — never up.
 */

const ID = "infinite-water";
const MAX = 112;
const WORLD_VER = 8;

type Drop = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  sliding: number;
  cling: number;
  meander: number;
  /** Shape jitter seed for organic rim */
  shape: number;
};

type RainWorld = { v?: number; drops: Drop[] };

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// Photographic pane + metaball lenses (organic beads, never teardrop trails).
const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform int uCount;
uniform vec4 uDrops[112];
uniform vec4 uShape[112];
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
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return v;
}

vec3 outdoorAt(vec2 uv) {
  // Soft overcast day — enough structure that drops can lens it.
  float sky = smoothstep(0.7, 0.05, uv.y);
  vec3 col = mix(vec3(0.32, 0.34, 0.31), vec3(0.58, 0.61, 0.58), sky);
  col = mix(col, vec3(0.68, 0.7, 0.67), pow(sky, 2.0) * 0.45);

  float canopy = fbm(vec2(uv.x * 2.4, uv.y * 3.0) + vec2(uTime * 0.006, 0.0));
  float trees = smoothstep(0.28, 0.68, canopy) * smoothstep(0.1, 0.62, 1.0 - uv.y);
  col = mix(col, vec3(0.3, 0.38, 0.26), trees * 0.55);
  col = mix(col, vec3(0.2, 0.26, 0.18), trees * trees * 0.35);

  // Soft trunk / branch suggestions so refraction has something to bend.
  float trunks = smoothstep(0.72, 0.9, fbm(vec2(uv.x * 18.0, uv.y * 3.0 + 2.0)));
  col = mix(col, vec3(0.22, 0.24, 0.2), trunks * trees * 0.35);

  float ground = smoothstep(0.48, 0.96, uv.y);
  float facade = fbm(uv * vec2(1.8, 4.0) + 3.0);
  col = mix(col, vec3(0.42, 0.4, 0.34), ground * 0.45 * facade);
  col += vec3(0.12, 0.1, 0.07) * ground * smoothstep(0.3, 0.85, noise(uv * 1.2 + 1.5));
  col = mix(col, vec3(0.4, 0.42, 0.39), 0.1 + 0.08 * fbm(uv * 0.65));
  return col;
}

void main() {
  vec2 uv = vUv;
  float aspect = max(uRes.x, 1.0) / max(uRes.y, 1.0);
  vec2 p = vec2(uv.x * aspect, uv.y);

  float film = fbm(uv * 16.0 + vec2(uTime * 0.012, 0.0));
  float filmFine = fbm(uv * 42.0 + 8.0);
  float dirt = fbm(uv * 5.5 + vec2(2.0, 5.0));
  float streak = fbm(vec2(uv.x * 12.0, uv.y * 2.0 + dirt * 0.35));
  float mistGrain = hash(floor(uv * max(uRes, vec2(1.0)) * 0.3));
  float cond = smoothstep(0.4, 0.76, film) * (0.5 + 0.5 * filmFine);

  vec2 filmWarp = vec2(
    (film - 0.5) * 0.014 + (filmFine - 0.5) * 0.004,
    (noise(uv * 8.0 + 1.0) - 0.5) * 0.01
  );
  vec3 room = outdoorAt(clamp(uv + filmWarp, 0.0, 1.0));

  // Condensation softens the view through the pane.
  float grey = dot(room, vec3(0.3, 0.5, 0.2));
  room = mix(room, vec3(grey), 0.1 + cond * 0.2);
  room *= 1.0 - cond * 0.06;
  room += (mistGrain - 0.5) * 0.035 * (0.35 + cond);
  room *= 1.0 - smoothstep(0.55, 0.92, dirt) * 0.08;
  room = mix(room, room * vec3(0.93, 0.96, 0.9), streak * 0.1);

  // Glass reflections / wet sheen.
  float fres = pow(clamp(1.0 - abs(uv.y - 0.5) * 1.5, 0.0, 1.0), 2.0);
  float edgeF = 1.0 - smoothstep(0.0, 0.07, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
  vec3 glassRefl = vec3(0.75, 0.8, 0.85) * (0.05 + 0.07 * fres + 0.12 * edgeF);
  float sheen = smoothstep(0.12, 0.5, noise(uv * vec2(1.2, 2.4) + vec2(0.3, 0.1)))
    * smoothstep(0.92, 0.32, uv.y);
  glassRefl += vec3(0.58, 0.6, 0.62) * sheen * 0.09;
  glassRefl += vec3(0.62, 0.68, 0.72) * pow(smoothstep(0.32, 0.78, streak), 2.0) * 0.06;

  vec3 col = room + glassRefl;

  float field = 0.0;
  vec2 grad = vec2(0.0);
  float nearestR = 0.008;
  for (int i = 0; i < 112; i++) {
    if (i >= uCount) break;
    vec2 c = vec2(uDrops[i].x * aspect, 1.0 - uDrops[i].y);
    float r = max(0.0024, uDrops[i].z);
    float seed = uShape[i].x;
    vec2 d = p - c;
    float ang = atan(d.y, d.x);
    float warp = 1.0
      + 0.1 * sin(ang * 3.0 + seed * 6.28)
      + 0.055 * sin(ang * 5.0 - seed * 4.0)
      + 0.03 * sin(ang * 7.0 + seed * 2.2);
    warp = mix(1.0, warp, clamp(r * 20.0, 0.0, 1.0));
    float dist = length(d) * warp;
    float rr = r * r;
    float contrib = rr / (dist * dist + 1e-5);
    field += contrib;
    grad += d * ((-2.0 * rr) / pow(dist * dist + 1e-5, 2.0)) * warp;
    if (contrib > 0.3) nearestR = max(nearestR, r);
  }

  float thresh = 1.0;
  float soft = thresh * 0.4;

  float shadowField = 0.0;
  for (int i = 0; i < 112; i++) {
    if (i >= uCount) break;
    vec2 c = vec2(uDrops[i].x * aspect, 1.0 - uDrops[i].y);
    float r = max(0.0024, uDrops[i].z);
    vec2 d = p - (c + vec2(0.0, -r * 0.5));
    shadowField += smoothstep(r * 2.6, r * 0.25, length(d)) * clamp(r * 14.0, 0.15, 1.0);
  }
  col *= 1.0 - clamp(shadowField, 0.0, 0.5) * 0.25;

  if (field > soft) {
    float inside = smoothstep(soft, thresh * 1.05, field);
    float body = smoothstep(soft, thresh * 1.8, field);
    float edge = smoothstep(soft, thresh, field) * (1.0 - smoothstep(thresh * 1.1, thresh * 3.0, field));

    vec2 nrm = normalize(grad + vec2(1e-5));
    float height = clamp((field - soft) / (thresh * 2.4), 0.0, 1.0);
    vec3 N = normalize(vec3(-nrm.x * (0.55 + height), height * 1.4 + 0.18, -nrm.y * (0.55 + height)));

    float lens = 0.07 + nearestR * 1.35;
    vec2 distort = nrm * lens * clamp(field - soft, 0.0, 2.0) * (0.55 + 0.55 * height);
    distort *= mix(1.0, -0.3, smoothstep(thresh * 1.35, thresh * 2.5, field) * clamp(nearestR * 20.0, 0.0, 1.0));
    vec2 ru = clamp(uv + vec2(distort.x / max(aspect, 0.01), distort.y), 0.0, 1.0);
    vec3 refr = outdoorAt(ru);
    refr = mix(refr, outdoorAt(clamp(uv + distort * 0.3, 0.0, 1.0)), 0.3);
    refr *= vec3(0.92, 0.97, 1.04);
    refr += vec3(0.05, 0.06, 0.07) * height;

    // Soft real-window lighting — tiny highlight, not a neon bloom.
    vec3 L1 = normalize(vec3(-0.25, 0.9, 0.35));
    vec3 V = normalize(vec3(0.05, 0.25, 1.0));
    float spec1 = pow(max(dot(N, normalize(L1 + V)), 0.0), 90.0);
    float rim = pow(clamp(1.0 - max(dot(N, V), 0.0), 0.0, 1.0), 3.0);

    // Mostly clear refraction of the outdoor scene; thin meniscus only.
    vec3 wet = mix(col, refr, 0.88 * body);
    wet *= mix(1.0, 0.92, edge * 0.5); // slight darkening at contact rim
    wet += vec3(0.55, 0.62, 0.68) * edge * (0.08 + rim * 0.12);
    wet += vec3(0.95, 0.97, 1.0) * spec1 * (0.35 + nearestR * 1.8);
    wet = mix(wet, wet * vec3(0.95, 0.98, 1.02), 0.25);

    col = mix(col, wet, clamp(inside, 0.0, 1.0));
  } else if (field > 0.1) {
    float halo = clamp((field - 0.1) * 0.45, 0.0, 0.35);
    col = mix(col, col * 0.9 + vec3(0.04, 0.05, 0.06), halo);
  }

  float frame = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  col = mix(vec3(0.12, 0.13, 0.12), col, smoothstep(0.0, 0.03, frame));
  col = clamp(col, 0.0, 1.0);
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

function mount(ctx: WebGLExperienceContext): ExperienceHandle {
  const { canvas, gl, audio, haptics } = ctx;
  const shared = getSharedAudio();
  let w = ctx.width;
  let h = ctx.height;

  const ensureRain = () => {
    void audio.resume().then(() => shared.startRain(0.34));
  };
  ensureRain();

  const saved = loadWorld<RainWorld>(ID);
  const drops: Drop[] = [];
  if (saved?.v === WORLD_VER && saved.drops?.length) {
    for (const d of saved.drops.slice(0, MAX)) {
      drops.push({
        x: d.x,
        y: Math.max(0, Math.min(1, d.y)),
        r: Math.max(0.003, Math.min(0.06, d.r)),
        vx: 0,
        vy: Math.max(0, d.vy ?? 0),
        sliding: d.sliding ?? 0,
        cling: d.cling ?? 0.5 + Math.random(),
        meander: d.meander ?? Math.random() * Math.PI * 2,
        shape: d.shape ?? Math.random(),
      });
    }
  }
  if (drops.length === 0) {
    // Fine mist + varied clinging beads + a few sliding masses.
    for (let i = 0; i < 38; i++) {
      drops.push({
        x: 0.04 + Math.random() * 0.92,
        y: Math.random() * 0.9,
        r: 0.0025 + Math.random() * 0.0035,
        vx: 0,
        vy: 0,
        sliding: 0,
        cling: 1.2 + Math.random() * 2.5,
        meander: Math.random() * Math.PI * 2,
        shape: Math.random(),
      });
    }
    for (let i = 0; i < 30; i++) {
      drops.push({
        x: 0.04 + Math.random() * 0.92,
        y: Math.random() * 0.85,
        r: 0.005 + Math.random() * 0.01,
        vx: 0,
        vy: 0,
        sliding: 0,
        cling: 0.8 + Math.random() * 2,
        meander: Math.random() * Math.PI * 2,
        shape: Math.random(),
      });
    }
    for (let i = 0; i < 10; i++) {
      drops.push({
        x: 0.1 + Math.random() * 0.8,
        y: Math.random() * 0.5,
        r: 0.014 + Math.random() * 0.014,
        vx: (Math.random() - 0.5) * 0.02,
        vy: 0.04 + Math.random() * 0.08,
        sliding: 1,
        cling: 0,
        meander: Math.random() * Math.PI * 2,
        shape: Math.random(),
      });
    }
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

  const loc = {
    res: gl.getUniformLocation(prog, "uRes"),
    time: gl.getUniformLocation(prog, "uTime"),
    count: gl.getUniformLocation(prog, "uCount"),
    drops: gl.getUniformLocation(prog, "uDrops"),
    shape: gl.getUniformLocation(prog, "uShape"),
  };
  const dropData = new Float32Array(MAX * 4);
  const shapeData = new Float32Array(MAX * 4);

  let grab: number | null = null;
  let px = 0;
  let py = 0;
  let spawnAcc = 0;
  let trailAcc = 0;
  let time = 0;
  let dirty = false;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let rainRate = 1.05;

  const persist = () => {
    saveWorld<RainWorld>(ID, {
      v: WORLD_VER,
      drops: drops.map((d) => ({ ...d })),
    });
    dirty = false;
  };
  const scheduleSave = () => {
    dirty = true;
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      persist();
    }, 2000);
  };

  const spawn = (x?: number, y?: number, r?: number, sliding = 0) => {
    if (drops.length >= MAX) {
      // Cull tiniest non-grabbed.
      let smallest = -1;
      for (let i = 0; i < drops.length; i++) {
        if (i === grab) continue;
        if (smallest < 0 || drops[i].r < drops[smallest].r) smallest = i;
      }
      if (smallest < 0) return;
      if (grab != null && grab > smallest) grab -= 1;
      drops.splice(smallest, 1);
    }
    drops.push({
      x: x ?? 0.03 + Math.random() * 0.94,
      y: y ?? -0.02 - Math.random() * 0.04,
      r: r ?? 0.0035 + Math.random() * 0.007,
      vx: 0,
      vy: 0,
      sliding,
      cling: 0.6 + Math.random() * 1.8,
      meander: Math.random() * Math.PI * 2,
      shape: Math.random(),
    });
  };

  /** Leave a wake of micro-droplets — this replaces the sperm-trail. */
  const shedTrail = (d: Drop, amount: number) => {
    if (drops.length >= MAX - 2) return;
    const n = amount > 0.02 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      spawn(
        d.x + (Math.random() - 0.5) * d.r * 1.2,
        d.y - 0.008 - Math.random() * 0.02,
        0.0028 + Math.random() * 0.004,
        0,
      );
    }
  };

  const nearestDrop = (x: number, y: number, maxDist: number) => {
    let best = -1;
    let bestD = maxDist;
    for (let i = 0; i < drops.length; i++) {
      // Prefer grabbing medium+ beads, not mist.
      if (drops[i].r < 0.006) continue;
      const dist = Math.hypot(drops[i].x - x, drops[i].y - y);
      const reach = maxDist + drops[i].r * 2;
      if (dist < reach && dist < bestD) {
        bestD = dist;
        best = i;
      }
    }
    return best;
  };

  const mergeInto = (keep: number, eat: number) => {
    if (keep === eat || !drops[keep] || !drops[eat]) return;
    const a = drops[keep];
    const b = drops[eat];
    const massA = a.r * a.r;
    const massB = b.r * b.r;
    const sum = massA + massB;
    a.x = (a.x * massA + b.x * massB) / sum;
    a.y = (a.y * massA + b.y * massB) / sum;
    a.vx = (a.vx * massA + b.vx * massB) / sum;
    a.r = Math.min(0.055, Math.sqrt(sum) * 1.02);
    a.sliding = 1;
    a.vy = Math.max(a.vy, b.vy, 0.03) + 0.05 + a.r * 2.2;
    a.cling = 0;
    a.shape = (a.shape + b.shape) * 0.5;
    drops.splice(eat, 1);
    if (grab === eat) grab = keep > eat ? keep - 1 : keep;
    else if (grab != null && grab > eat) grab -= 1;
    haptics.tap(4 + Math.round(a.r * 50));
    scheduleSave();
  };

  const toScreen = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / Math.max(rect.width, 1),
      y: (clientY - rect.top) / Math.max(rect.height, 1),
    };
  };

  const onDown = (e: PointerEvent) => {
    const p = toScreen(e.clientX, e.clientY);
    px = p.x;
    py = p.y;
    grab = nearestDrop(px, py, 0.05);
    ensureRain();
    if (grab != null && drops[grab]) {
      drops[grab].sliding = 1;
      haptics.tap(4);
    } else {
      grab = null;
    }
  };
  const onMove = (e: PointerEvent) => {
    const p = toScreen(e.clientX, e.clientY);
    px = p.x;
    py = p.y;
  };
  const onUp = () => {
    grab = null;
  };

  const hud = createHud(ctx.host);
  hud.slider("Rain", 0.1, 1.6, rainRate, (v) => {
    rainRate = v;
  });
  hud.button("Wipe glass", () => {
    drops.length = 0;
    grab = null;
    clearWorld(ID);
    audio.whoosh(0.2);
    scheduleSave();
  });

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  canvas.style.touchAction = "none";

  return {
    update(dt: number) {
      time += dt;
      const step = Math.min(0.033, dt);

      spawnAcc += step * rainRate * 12;
      while (spawnAcc > 1) {
        spawnAcc -= 1;
        // Mostly mist; occasional medium bead that may soon slide.
        const roll = Math.random();
        const r =
          roll < 0.55
            ? 0.0024 + Math.random() * 0.003
            : roll < 0.9
              ? 0.004 + Math.random() * 0.006
              : 0.009 + Math.random() * 0.008;
        spawn(undefined, undefined, r, 0);
      }

      if (grab != null && drops[grab]) {
        const d = drops[grab];
        const ox = d.x;
        const oy = d.y;
        // Follow finger in X freely; Y only sideways/down — never up.
        const targetY = Math.max(d.y, py);
        d.x += (px - d.x) * Math.min(1, 20 * step);
        d.y += (targetY - d.y) * Math.min(1, 20 * step);
        d.vx = (d.x - ox) / Math.max(step, 1e-3);
        d.vy = Math.max(0, (d.y - oy) / Math.max(step, 1e-3));
        d.sliding = 1;
        const move = Math.hypot(d.x - ox, d.y - oy);
        if (move > 0.008) {
          // Smear: shed volume as micro-drops along the path (down/side only).
          d.r = Math.max(0.006, d.r * 0.992);
          if (Math.random() < 0.5) {
            spawn(ox + (Math.random() - 0.5) * 0.01, oy - 0.004, 0.003 + Math.random() * 0.004, 0);
          }
        }
      }

      for (let i = 0; i < drops.length; i++) {
        if (i === grab) continue;
        const d = drops[i];
        d.meander += step * (1 + d.r * 10);

        if (!d.sliding) {
          d.cling -= step * (0.1 + d.r * 5);
          // Mass overcomes adhesion.
          if (d.r > 0.012 && (d.cling < 0 || Math.random() < (d.r - 0.01) * step * 3)) {
            d.sliding = 1;
            d.vy = 0.02 + d.r * 1.2;
          }
          d.vx = 0;
          d.vy = 0;
          continue;
        }

        const g = 0.4 + d.r * 22;
        d.vy += g * step;
        const drag = d.r < 0.01 ? 0.88 : d.r < 0.022 ? 0.93 : 0.97;
        d.vy *= Math.pow(drag, step * 60);
        // Irregular path — stutter toward nearby mass / meander.
        d.vx += Math.sin(d.meander) * 0.015 * step * 60 * 0.025;
        d.vx *= Math.pow(0.88, step * 60);
        d.x += d.vx * step;
        d.y += d.vy * step;
        d.x = Math.max(0.02, Math.min(0.98, d.x));

        // Shed trail as discrete micro-drops (not a connected teardrop).
        trailAcc += d.vy * step * (0.5 + d.r * 20);
        if (trailAcc > 0.035 && d.r > 0.01) {
          trailAcc = 0;
          shedTrail(d, d.r);
          d.r *= 0.995;
        }

        if (d.r < 0.008 && d.vy < 0.03 && Math.random() < step * 0.5) {
          d.sliding = 0;
          d.vy = 0;
          d.vx = 0;
          d.cling = 0.5 + Math.random();
        }
      }

      // Coalesce into one organic mass.
      for (let i = 0; i < drops.length; i++) {
        for (let j = i + 1; j < drops.length; j++) {
          const a = drops[i];
          const b = drops[j];
          const dist = Math.hypot(b.x - a.x, b.y - a.y);
          if (dist >= (a.r + b.r) * 0.92) continue;
          let keep = a.r >= b.r ? i : j;
          let eat = keep === i ? j : i;
          if (grab === eat) {
            const t = keep;
            keep = eat;
            eat = t;
          } else if (grab !== keep && drops[eat].vy > drops[keep].vy + 0.04) {
            const t = keep;
            keep = eat;
            eat = t;
          }
          mergeInto(keep, eat);
          j = i;
        }
      }

      for (let i = drops.length - 1; i >= 0; i--) {
        if (drops[i].y > 1.1 || drops[i].x < -0.05 || drops[i].x > 1.05) {
          if (grab === i) grab = null;
          else if (grab != null && grab > i) grab -= 1;
          drops.splice(i, 1);
        }
      }

      for (let i = 0; i < MAX; i++) {
        const d = drops[i];
        const o = i * 4;
        if (d) {
          dropData[o] = d.x;
          dropData[o + 1] = d.y;
          dropData[o + 2] = d.r;
          dropData[o + 3] = d.sliding;
          shapeData[o] = d.shape;
          shapeData[o + 1] = shapeData[o + 2] = shapeData[o + 3] = 0;
        } else {
          dropData[o] = dropData[o + 1] = dropData[o + 2] = dropData[o + 3] = 0;
          shapeData[o] = shapeData[o + 1] = shapeData[o + 2] = shapeData[o + 3] = 0;
        }
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.BLEND);
      gl.useProgram(prog);
      // Use backing-store size so film grain / aspect match the drawn framebuffer.
      gl.uniform2f(loc.res, canvas.width, canvas.height);
      gl.uniform1f(loc.time, time);
      gl.uniform1i(loc.count, Math.min(drops.length, MAX));
      gl.uniform4fv(loc.drops, dropData);
      gl.uniform4fv(loc.shape, shapeData);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    destroy() {
      shared.stopRain();
      if (saveTimer) clearTimeout(saveTimer);
      if (dirty || drops.length) persist();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      hud.destroy();
      gl.deleteProgram(prog);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
    },
  };
}

export const infiniteWater: WebGLExperienceModule = {
  id: "infinite-water",
  collection: "field",
  kind: "webgl",
  name: "Rain Glass",
  modality: "Rain",
  tagline: "Rain beads on glass — cling, slide, merge, race.",
  hint: "Tiny drops cling. Bigger ones slide and catch others. Drag sideways or down.",
  accent: "#6a9fb5",
  badge: "World",
  mount,
};
