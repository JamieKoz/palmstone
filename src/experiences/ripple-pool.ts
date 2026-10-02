import { createHud } from "@/engine/hud";
import type {
  ExperienceHandle,
  WebGLExperienceContext,
  WebGLExperienceModule,
} from "@/engine/types";

/**
 * Ripple Pool — WebGL2 interactive water (jquery.ripples–style).
 * Heightfield sim (ping-pong) + refraction of a procedural pool bed.
 * A small school swims on the bed and is shoved by the same drag that drops ripples.
 */

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const DROP_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uStrength;
out vec4 outColor;
void main() {
  vec4 info = texture(uTex, vUv);
  float drop = max(0.0, 1.0 - length(uCenter - vUv) / uRadius);
  drop = 0.5 - cos(drop * 3.14159265) * 0.5;
  info.r += drop * uStrength;
  outColor = info;
}
`;

const UPDATE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDelta;
out vec4 outColor;
void main() {
  vec4 info = texture(uTex, vUv);
  float average = (
    texture(uTex, vUv - vec2(uDelta.x, 0.0)).r +
    texture(uTex, vUv - vec2(0.0, uDelta.y)).r +
    texture(uTex, vUv + vec2(uDelta.x, 0.0)).r +
    texture(uTex, vUv + vec2(0.0, uDelta.y)).r
  ) * 0.25;
  info.g += (average - info.r) * 2.0;
  info.g *= 0.995;
  info.r += info.g;
  outColor = info;
}
`;

const RENDER_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uRipples;
uniform vec2 uDelta;
uniform float uPerturbance;
uniform float uTime;
uniform vec2 uRes;
uniform vec3 uTint;
uniform vec4 uFish[5];
uniform vec4 uFishStyle[5];
uniform vec4 uFishColor[5];
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

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.05;
    a *= 0.5;
  }
  return v;
}

vec3 sampleBackground(vec2 uv) {
  // Dark wet-stone / deep pool bed with soft caustic shimmer
  float n = fbm(uv * 6.0);
  float n2 = fbm(uv * 14.0 + 3.1);
  float pebbles = smoothstep(0.35, 0.75, n);
  float grain = n2 * 0.35;

  vec3 deep = vec3(0.04, 0.08, 0.12);
  vec3 mid = vec3(0.08, 0.16, 0.22);
  vec3 stone = vec3(0.14, 0.18, 0.2);
  vec3 highlight = vec3(0.22, 0.32, 0.36);

  vec3 col = mix(deep, mid, pebbles);
  col = mix(col, stone, grain * 0.55);

  // Slow caustic ribbons
  float c1 = sin((uv.x + uv.y) * 18.0 + uTime * 0.35 + n * 2.0);
  float c2 = sin((uv.x - uv.y) * 22.0 - uTime * 0.28);
  float caustic = pow(max(0.0, c1 * c2), 2.0) * 0.12;
  col += highlight * caustic;

  // Soft vignette
  float vig = smoothstep(1.15, 0.35, length(uv - 0.5));
  col *= 0.55 + 0.45 * vig;
  return col;
}

// Top-down fish on the pool bed. "local" is screen-height fractions so the body stays round.
void fishLayer(vec2 uv, float aspect, out vec3 rgb, out float alpha, out float shadow) {
  rgb = vec3(0.0);
  alpha = 0.0;
  shadow = 0.0;
  for (int i = 0; i < 5; i++) {
    vec2 pos = vec2(uFish[i].x, 1.0 - uFish[i].y);
    vec2 fwd = vec2(uFish[i].z, -uFish[i].w);
    vec2 delta = uv - pos;
    vec2 deltaPx = vec2(delta.x * aspect, delta.y);
    vec2 fwdPx = normalize(vec2(fwd.x * aspect, fwd.y));
    vec2 sidePx = vec2(-fwdPx.y, fwdPx.x);
    vec2 local = vec2(dot(deltaPx, fwdPx), dot(deltaPx, sidePx));

    float sc = uFishStyle[i].x;
    float phase = uFishStyle[i].y;
    float wagRate = uFishStyle[i].z;
    float spd = uFishStyle[i].w;
    float len = 0.064 * sc;
    float wid = 0.0105 * sc;
    float nx = local.x / len;

    // Slender teardrop: narrow nose, fuller middle, thin peduncle.
    float bodyHalf = wid * smoothstep(-0.58, -0.22, nx) * smoothstep(1.02, 0.42, nx);
    float fullness = sin(clamp((nx + 0.35) / 1.25, 0.0, 1.0) * 3.14159265);
    bodyHalf *= 0.62 + 0.38 * fullness;
    float bodyM = 0.0;
    if (bodyHalf > 0.0005) {
      bodyM = smoothstep(bodyHalf * 1.04, bodyHalf * 0.86, abs(local.y));
    }

    float beat = sin(uTime * (3.4 + wagRate) * (0.7 + spd * 2.8) + phase);
    float wag = beat * wid * (1.6 + spd * 6.0);
    float along = -nx - 0.32;
    float across = local.y - wag * smoothstep(0.0, 0.55, along);
    float tailHalf = wid * mix(0.28, 1.45, clamp(along / 0.5, 0.0, 1.0));
    float tailM = 0.0;
    if (along > 0.02 && along < 0.58 && tailHalf > 0.0004) {
      tailM = smoothstep(tailHalf, tailHalf * 0.4, abs(across));
      float notch = smoothstep(0.26, 0.5, along) * (1.0 - smoothstep(0.0, wid * 0.28, abs(across)));
      tailM *= 1.0 - notch * 0.75;
    }

    float mask = max(bodyM, tailM);

    vec2 shP = local - vec2(-len * 0.08, -wid * 1.1);
    float sh = length(shP / vec2(len * 0.62, wid * 1.15));
    shadow = max(shadow, smoothstep(1.15, 0.35, sh) * 0.34);

    float spine = bodyHalf > 0.0005 ? smoothstep(bodyHalf, 0.0, abs(local.y)) : 0.0;
    vec3 base = mix(uTint, uFishColor[i].rgb, 0.82);
    vec3 col = mix(base * 0.72, min(base * 1.4, vec3(0.96)), spine);
    float rim = bodyHalf > 0.0005 ? smoothstep(bodyHalf * 0.7, bodyHalf, abs(local.y)) : 0.0;
    col = mix(col, base * 0.4, rim * bodyM);
    col = mix(col, base * 0.78, tailM);
    float eye = min(
      length((local - vec2(len * 0.48, wid * 0.42)) / (wid * 0.55)),
      length((local - vec2(len * 0.48, -wid * 0.42)) / (wid * 0.55))
    );
    col = mix(col, base * 0.2, smoothstep(1.05, 0.35, eye) * bodyM);
    col += vec3(0.55, 0.7, 0.74) * spine * bodyM * 0.22;

    float a = clamp(mask, 0.0, 1.0);
    rgb = mix(rgb, col, a);
    alpha += a * (1.0 - alpha);
  }
}

void main() {
  float height = texture(uRipples, vUv).r;
  float heightX = texture(uRipples, vec2(vUv.x + uDelta.x, vUv.y)).r;
  float heightY = texture(uRipples, vec2(vUv.x, vUv.y + uDelta.y)).r;
  vec3 dx = vec3(uDelta.x, heightX - height, 0.0);
  vec3 dy = vec3(0.0, heightY - height, uDelta.y);
  vec2 offset = -normalize(cross(dy, dx)).xz;

  vec2 uv = vUv + offset * uPerturbance;
  vec3 col = mix(sampleBackground(uv), uTint, 0.5);

  vec3 fishRgb;
  float fishA;
  float fishShadow;
  fishLayer(mix(vUv, uv, 0.72), uRes.x / max(uRes.y, 1.0), fishRgb, fishA, fishShadow);
  col *= mix(1.0, 0.8, fishShadow);
  col = mix(col, fishRgb, fishA);

  float specular = pow(max(0.0, dot(offset, normalize(vec2(-0.55, 1.0)))), 4.0);
  col += mix(vec3(0.55, 0.72, 0.8), uTint, 0.7) * specular * 0.85;

  // Subtle fresnel rim from height
  col += vec3(0.12, 0.22, 0.28) * abs(height) * 0.15;

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

function createFloatTarget(gl: WebGL2RenderingContext, size: number) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // RGBA16F for height/velocity simulation
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, size, size, 0, gl.RGBA, gl.HALF_FLOAT, null);

  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("ripple FBO incomplete");
  }
  return { tex, fbo };
}

function mount(ctx: WebGLExperienceContext): ExperienceHandle {
  const { canvas, gl, audio, haptics } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  // Prefer half-float; fall back to unsigned byte if needed
  const extColor = gl.getExtension("EXT_color_buffer_float");
  const useFloat = !!extColor;

  const SIM = Math.min(512, Math.max(256, Math.round(Math.max(w, h) * 0.55)));

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const dropFs = compile(gl, gl.FRAGMENT_SHADER, DROP_FRAG);
  const updateFs = compile(gl, gl.FRAGMENT_SHADER, UPDATE_FRAG);
  const renderFs = compile(gl, gl.FRAGMENT_SHADER, RENDER_FRAG);
  const dropProg = link(gl, vs, dropFs);
  const updateProg = link(gl, vs, updateFs);
  const renderProg = link(gl, vs, renderFs);
  gl.deleteShader(vs);
  gl.deleteShader(dropFs);
  gl.deleteShader(updateFs);
  gl.deleteShader(renderFs);

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  function makeTarget() {
    if (useFloat) {
      try {
        return createFloatTarget(gl, SIM);
      } catch {
        /* fall through */
      }
    }
    // Unsigned-byte fallback (less precision, still usable)
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SIM, SIM, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { tex, fbo };
  }

  const buffers = [makeTarget(), makeTarget()];
  let bufferWrite = 0;

  const dropLoc = {
    tex: gl.getUniformLocation(dropProg, "uTex"),
    center: gl.getUniformLocation(dropProg, "uCenter"),
    radius: gl.getUniformLocation(dropProg, "uRadius"),
    strength: gl.getUniformLocation(dropProg, "uStrength"),
  };
  const updateLoc = {
    tex: gl.getUniformLocation(updateProg, "uTex"),
    delta: gl.getUniformLocation(updateProg, "uDelta"),
  };
  const renderLoc = {
    ripples: gl.getUniformLocation(renderProg, "uRipples"),
    delta: gl.getUniformLocation(renderProg, "uDelta"),
    perturbance: gl.getUniformLocation(renderProg, "uPerturbance"),
    time: gl.getUniformLocation(renderProg, "uTime"),
    res: gl.getUniformLocation(renderProg, "uRes"),
    tint: gl.getUniformLocation(renderProg, "uTint"),
    fish: gl.getUniformLocation(renderProg, "uFish"),
    fishStyle: gl.getUniformLocation(renderProg, "uFishStyle"),
    fishColor: gl.getUniformLocation(renderProg, "uFishColor"),
  };

  let rings = 1;
  let sizeMul = 1;
  let tint: [number, number, number] = [0.25, 0.48, 0.58];
  const hud = createHud(ctx.host);
  hud.slider("Ripples", 1, 5, rings, (v) => {
    rings = Math.round(v);
  });
  hud.slider("Size", 0.45, 2.2, sizeMul, (v) => {
    sizeMul = v;
  });
  hud.swatches(
    [
      { hex: "#6a9fb5", label: "Pool" },
      { hex: "#6db3a8", label: "Jade" },
      { hex: "#8aa4c8", label: "Dusk" },
      { hex: "#c4a574", label: "Sand" },
    ],
    0,
    (hex) => {
      const n = Number.parseInt(hex.slice(1), 16);
      tint = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    },
  );

  const delta = [1 / SIM, 1 / SIM];
  const DROP_RADIUS = 20 / Math.max(w, h); // match jquery demo scale
  const PERTURBANCE = 0.045;
  let time = 0;
  let pointerDown = false;
  let lastDropX = -1;
  let lastDropY = -1;
  let lastWhoosh = 0;
  let strokeX = -1;
  let strokeY = -1;

  const FISH_N = 5;
  const fishPos = new Float32Array(FISH_N * 4);
  const fishStyle = new Float32Array(FISH_N * 4);
  const fishColor = new Float32Array(FISH_N * 4);
  const fish = [
    { scale: 1.12, cruise: 0.05, color: [0.64, 0.8, 0.82] as [number, number, number] },
    { scale: 0.9, cruise: 0.064, color: [0.46, 0.66, 0.62] as [number, number, number] },
    { scale: 1.02, cruise: 0.056, color: [0.72, 0.78, 0.68] as [number, number, number] },
    { scale: 0.82, cruise: 0.07, color: [0.5, 0.64, 0.74] as [number, number, number] },
    { scale: 1.06, cruise: 0.052, color: [0.58, 0.72, 0.64] as [number, number, number] },
  ].map((look, i) => {
    const spots = [
      [0.3, 0.36],
      [0.66, 0.32],
      [0.48, 0.55],
      [0.32, 0.7],
      [0.7, 0.66],
    ];
    return {
      x: spots[i][0] + (Math.random() - 0.5) * 0.06,
      y: spots[i][1] + (Math.random() - 0.5) * 0.06,
      heading: Math.random() * Math.PI * 2,
      aim: 0,
      cruise: look.cruise,
      vx: 0,
      vy: 0,
      phase: Math.random() * Math.PI * 2,
      wanderRate: 0.35 + Math.random() * 0.45,
      wag: 0.5 + Math.random() * 1.3,
      scale: look.scale,
      color: look.color,
      wake: Math.random() * 0.04,
    };
  });
  for (const f of fish) f.aim = f.heading;

  const wrapAngle = (a: number) => {
    const t = Math.PI * 2;
    return ((a + Math.PI) % t + t) % t - Math.PI;
  };

  const capVelocity = (f: (typeof fish)[number], cap: number) => {
    const sp = Math.hypot(f.vx, f.vy);
    if (sp > cap) {
      f.vx *= cap / sp;
      f.vy *= cap / sp;
    }
  };

  const pulseFish = (x: number, y: number) => {
    const reach = 0.1;
    for (const f of fish) {
      const ox = f.x - x;
      const oy = f.y - y;
      const d = Math.hypot(ox, oy);
      if (d > reach || d < 1e-4) continue;
      const fall = (1 - d / reach) ** 1.5;
      f.vx += (ox / d) * 0.32 * fall;
      f.vy += (oy / d) * 0.32 * fall;
      capVelocity(f, 0.48);
    }
  };

  // Shove fish crossed by this drag stroke. Closest point on the segment so a fast swipe still hits.
  const shoveFish = (x0: number, y0: number, x1: number, y1: number) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.0005) return;
    const reach = 0.12;
    const power = 3.2 * Math.min(dist * 16, 1.15);
    const dirx = dx / dist;
    const diry = dy / dist;
    for (const f of fish) {
      const t = Math.max(0, Math.min(1, ((f.x - x0) * dx + (f.y - y0) * dy) / (dist * dist)));
      const ox = f.x - (x0 + dx * t);
      const oy = f.y - (y0 + dy * t);
      const d = Math.hypot(ox, oy);
      if (d > reach) continue;
      const fall = (1 - d / reach) ** 1.35;
      const inv = 1 / Math.max(d, 0.01);
      f.vx += dirx * power * fall + ox * inv * power * fall * 0.38;
      f.vy += diry * power * fall + oy * inv * power * fall * 0.38;
      capVelocity(f, 0.5);
    }
  };

  const toUv = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  };

  const clearBuffers = () => {
    for (const b of buffers) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
      gl.viewport(0, 0, SIM, SIM);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };
  clearBuffers();

  const drawQuad = () => {
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  };

  const stamp = (uvX: number, uvY: number, radius: number, strength: number) => {
    const count = Math.max(1, Math.round(rings));
    for (let i = 0; i < count; i++) {
      drop(
        uvX,
        uvY,
        radius * sizeMul * (1 + i * 0.4),
        strength * Math.max(0.22, 1 - i * 0.18),
      );
    }
  };

  const drop = (uvX: number, uvY: number, radius: number, strength: number) => {
    const read = buffers[bufferWrite];
    const write = buffers[1 - bufferWrite];
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, SIM, SIM);
    gl.useProgram(dropProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, read.tex);
    gl.uniform1i(dropLoc.tex, 0);
    gl.uniform2f(dropLoc.center, uvX, 1 - uvY);
    gl.uniform1f(dropLoc.radius, radius);
    gl.uniform1f(dropLoc.strength, strength);
    drawQuad();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    bufferWrite = 1 - bufferWrite;
  };

  const stepSim = () => {
    const read = buffers[bufferWrite];
    const write = buffers[1 - bufferWrite];
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, SIM, SIM);
    gl.useProgram(updateProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, read.tex);
    gl.uniform1i(updateLoc.tex, 0);
    gl.uniform2f(updateLoc.delta, delta[0], delta[1]);
    drawQuad();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    bufferWrite = 1 - bufferWrite;
  };

  const maybeDropAlong = (x: number, y: number, strength: number, radiusScale = 1) => {
    if (lastDropX < 0) {
      stamp(x, y, DROP_RADIUS * radiusScale, strength);
      lastDropX = x;
      lastDropY = y;
      return;
    }
    const dist = Math.hypot(x - lastDropX, y - lastDropY);
    const step = 0.018;
    if (dist < step) return;
    const n = Math.min(8, Math.ceil(dist / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      stamp(
        lastDropX + (x - lastDropX) * t,
        lastDropY + (y - lastDropY) * t,
        DROP_RADIUS * radiusScale,
        strength * (0.85 + 0.15 * (1 - t)),
      );
    }
    lastDropX = x;
    lastDropY = y;
  };

  const stepFish = (dt: number) => {
    let schoolX = 0;
    let schoolY = 0;
    for (const f of fish) {
      schoolX += f.x;
      schoolY += f.y;
    }
    schoolX /= FISH_N;
    schoolY /= FISH_N;

    const edge = 0.13;
    let wakes = 0;
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      // Aim drifts on its own; heading eases toward it, so paths curve instead of orbiting.
      f.aim +=
        dt *
        (Math.sin(time * f.wanderRate + f.phase) * 0.65 +
          Math.sin(time * f.wanderRate * 0.37 + f.phase * 2.1) * 0.28);

      const toSchoolX = schoolX - f.x;
      const toSchoolY = schoolY - f.y;
      if (Math.hypot(toSchoolX, toSchoolY) > 0.3) {
        f.aim += wrapAngle(Math.atan2(toSchoolY, toSchoolX) - f.aim) * Math.min(1, dt * 0.7);
      }

      let sepX = 0;
      let sepY = 0;
      for (let j = 0; j < fish.length; j++) {
        if (i === j) continue;
        const ox = f.x - fish[j].x;
        const oy = f.y - fish[j].y;
        const d2 = ox * ox + oy * oy;
        const sep = 0.09;
        if (d2 < sep * sep && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          sepX += (ox / d) * (1 - d / sep);
          sepY += (oy / d) * (1 - d / sep);
        }
      }
      if (sepX !== 0 || sepY !== 0) {
        f.aim += wrapAngle(Math.atan2(sepY, sepX) - f.aim) * Math.min(1, dt * 1.6);
      }

      let edgeX = 0;
      let edgeY = 0;
      if (f.x < edge) edgeX = 1;
      else if (f.x > 1 - edge) edgeX = -1;
      if (f.y < edge) edgeY = 1;
      else if (f.y > 1 - edge) edgeY = -1;
      if (edgeX !== 0 || edgeY !== 0) {
        const depth = Math.max(
          edgeX > 0 ? (edge - f.x) / edge : edgeX < 0 ? (f.x - (1 - edge)) / edge : 0,
          edgeY > 0 ? (edge - f.y) / edge : edgeY < 0 ? (f.y - (1 - edge)) / edge : 0,
        );
        f.aim += wrapAngle(Math.atan2(edgeY, edgeX) - f.aim) * Math.min(1, dt * (2.2 + depth * 5));
      }

      const push = Math.hypot(f.vx, f.vy);
      if (push > 0.06) {
        f.aim += wrapAngle(Math.atan2(f.vy, f.vx) - f.aim) * Math.min(1, dt * push * 7);
      }
      const maxTurn = (1.25 + Math.min(push * 4, 3.2)) * dt;
      f.heading += Math.max(-maxTurn, Math.min(maxTurn, wrapAngle(f.aim - f.heading)));

      const loiter = 0.64 + 0.36 * (0.5 + 0.5 * Math.sin(time * 0.42 + f.phase));
      const fwd = f.cruise * loiter;
      f.vx *= Math.exp(-dt * 1.7);
      f.vy *= Math.exp(-dt * 1.7);
      f.x += (Math.cos(f.heading) * fwd + f.vx) * dt;
      f.y += (Math.sin(f.heading) * fwd + f.vy) * dt;

      const pad = 0.05;
      if (f.x < pad) {
        f.x = pad;
        if (f.vx < 0) f.vx = 0;
      } else if (f.x > 1 - pad) {
        f.x = 1 - pad;
        if (f.vx > 0) f.vx = 0;
      }
      if (f.y < pad) {
        f.y = pad;
        if (f.vy < 0) f.vy = 0;
      } else if (f.y > 1 - pad) {
        f.y = 1 - pad;
        if (f.vy > 0) f.vy = 0;
      }

      const speed = Math.hypot(Math.cos(f.heading) * fwd + f.vx, Math.sin(f.heading) * fwd + f.vy);
      f.wake += speed * dt;
      if (f.wake > 0.042 && wakes < 2 && speed > 0.035) {
        f.wake = 0;
        wakes += 1;
        const back = 0.02 * f.scale;
        drop(
          f.x - Math.cos(f.heading) * back,
          f.y - Math.sin(f.heading) * back,
          DROP_RADIUS * 0.38,
          Math.min(0.016, 0.004 + push * 0.04),
        );
      }
    }
  };

  const onDown = (e: PointerEvent) => {
    pointerDown = true;
    void audio.resume();
    const p = toUv(e.clientX, e.clientY);
    lastDropX = -1;
    strokeX = p.x;
    strokeY = p.y;
    pulseFish(p.x, p.y);
    maybeDropAlong(p.x, p.y, 0.35, 1.35);
    audio.water(0.75);
    haptics.tap(12);
  };
  const onMove = (e: PointerEvent) => {
    const p = toUv(e.clientX, e.clientY);
    // Always disturb water under the finger/cursor — like the demo
    if (pointerDown) {
      if (strokeX >= 0) shoveFish(strokeX, strokeY, p.x, p.y);
      strokeX = p.x;
      strokeY = p.y;
      maybeDropAlong(p.x, p.y, 0.12, 1);
      const now = performance.now();
      if (now - lastWhoosh > 70) {
        audio.water(0.45);
        lastWhoosh = now;
      }
    } else {
      // Soft hover wake
      maybeDropAlong(p.x, p.y, 0.035, 0.7);
    }
  };
  const onUp = () => {
    pointerDown = false;
    lastDropX = -1;
    strokeX = -1;
  };
  const onLeave = () => {
    lastDropX = -1;
    strokeX = -1;
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  window.addEventListener("pointerup", onUp);

  // Seed a few ambient drops so the pool feels alive
  for (let i = 0; i < 3; i++) {
    drop(0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4, DROP_RADIUS * 1.2, 0.08);
  }

  return {
    update(dt: number) {
      time += dt;
      stepFish(dt);
      // Two sim steps per frame for smoother propagation
      stepSim();
      stepSim();

      const ripples = buffers[bufferWrite];
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(renderProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, ripples.tex);
      gl.uniform1i(renderLoc.ripples, 0);
      gl.uniform2f(renderLoc.delta, delta[0], delta[1]);
      gl.uniform1f(renderLoc.perturbance, PERTURBANCE);
      gl.uniform1f(renderLoc.time, time);
      gl.uniform2f(renderLoc.res, canvas.width, canvas.height);
      gl.uniform3f(renderLoc.tint, tint[0], tint[1], tint[2]);
      for (let i = 0; i < FISH_N; i++) {
        const f = fish[i];
        const o = i * 4;
        const push = Math.hypot(f.vx, f.vy);
        fishPos[o] = f.x;
        fishPos[o + 1] = f.y;
        fishPos[o + 2] = Math.cos(f.heading);
        fishPos[o + 3] = Math.sin(f.heading);
        fishStyle[o] = f.scale;
        fishStyle[o + 1] = f.phase;
        fishStyle[o + 2] = f.wag;
        fishStyle[o + 3] = Math.min(1, push * 2.4);
        fishColor[o] = f.color[0];
        fishColor[o + 1] = f.color[1];
        fishColor[o + 2] = f.color[2];
        fishColor[o + 3] = 1;
      }
      gl.uniform4fv(renderLoc.fish, fishPos);
      gl.uniform4fv(renderLoc.fishStyle, fishStyle);
      gl.uniform4fv(renderLoc.fishColor, fishColor);
      drawQuad();
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    destroy() {
      hud.destroy();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerup", onUp);
      for (const b of buffers) {
        gl.deleteFramebuffer(b.fbo);
        gl.deleteTexture(b.tex);
      }
      gl.deleteProgram(dropProg);
      gl.deleteProgram(updateProg);
      gl.deleteProgram(renderProg);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
    },
  };
}

export const ripplePool: WebGLExperienceModule = {
  kind: "webgl",
  id: "ripple-pool",
  collection: "studio",
  name: "Ripple Pool",
  modality: "Fluid",
  tagline: "Drag the surface — real water refraction and wake.",
  hint: "Drag the water to push the fish. Press for deeper drops.",
  accent: "#6a9fb5",
  badge: "WebGL",
  mount,
};
