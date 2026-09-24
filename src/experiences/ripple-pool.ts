import type {
  ExperienceHandle,
  WebGLExperienceContext,
  WebGLExperienceModule,
} from "@/engine/types";

/**
 * Ripple Pool — WebGL2 interactive water (jquery.ripples–style).
 * Heightfield sim (ping-pong) + refraction of a procedural pool bed.
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

void main() {
  float height = texture(uRipples, vUv).r;
  float heightX = texture(uRipples, vec2(vUv.x + uDelta.x, vUv.y)).r;
  float heightY = texture(uRipples, vec2(vUv.x, vUv.y + uDelta.y)).r;
  vec3 dx = vec3(uDelta.x, heightX - height, 0.0);
  vec3 dy = vec3(0.0, heightY - height, uDelta.y);
  vec2 offset = -normalize(cross(dy, dx)).xz;

  vec2 uv = vUv + offset * uPerturbance;
  vec3 col = sampleBackground(uv);

  float specular = pow(max(0.0, dot(offset, normalize(vec2(-0.55, 1.0)))), 4.0);
  col += vec3(0.55, 0.72, 0.8) * specular * 0.85;

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

  let buffers = [makeTarget(), makeTarget()];
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
  };

  const delta = [1 / SIM, 1 / SIM];
  const DROP_RADIUS = 20 / Math.max(w, h); // match jquery demo scale
  const PERTURBANCE = 0.045;
  let time = 0;
  let pointerDown = false;
  let lastDropX = -1;
  let lastDropY = -1;
  let lastWhoosh = 0;

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
      drop(x, y, DROP_RADIUS * radiusScale, strength);
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
      drop(
        lastDropX + (x - lastDropX) * t,
        lastDropY + (y - lastDropY) * t,
        DROP_RADIUS * radiusScale,
        strength * (0.85 + 0.15 * (1 - t)),
      );
    }
    lastDropX = x;
    lastDropY = y;
  };

  const onDown = (e: PointerEvent) => {
    pointerDown = true;
    void audio.resume();
    const p = toUv(e.clientX, e.clientY);
    lastDropX = -1;
    maybeDropAlong(p.x, p.y, 0.35, 1.35);
    audio.water(0.75);
    haptics.tap(12);
  };
  const onMove = (e: PointerEvent) => {
    const p = toUv(e.clientX, e.clientY);
    // Always disturb water under the finger/cursor — like the demo
    if (pointerDown) {
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
  };
  const onLeave = () => {
    lastDropX = -1;
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
      drawQuad();
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    destroy() {
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
  name: "Ripple Pool",
  modality: "Fluid",
  tagline: "Drag the surface — real water refraction and wake.",
  hint: "Move across the water. Press for deeper drops.",
  accent: "#6a9fb5",
  badge: "WebGL",
  mount,
};
