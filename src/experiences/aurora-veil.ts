import { createHud } from "@/engine/hud";
import type {
  ExperienceHandle,
  WebGLExperienceContext,
  WebGLExperienceModule,
} from "@/engine/types";

/**
 * Aurora Veil — full-screen WebGL2 fragment shader field.
 * Soft volumetric bands respond to generative audio + touch.
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

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uBass;
uniform float uBands[24];
uniform vec2 uPointer;
uniform float uPointerDown;
uniform float uIntensity;
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
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.05;
    a *= 0.5;
  }
  return v;
}

float band(float x) {
  float f = clamp(x, 0.0, 0.999) * 23.0;
  int i = int(floor(f));
  float t = fract(f);
  return mix(uBands[i], uBands[min(i + 1, 23)], t);
}

void main() {
  vec2 uv = vUv;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  float audio = band(uv.x) * 0.7 + band(fract(uv.x + 0.33)) * 0.3;
  float n = fbm(p * 2.2 + vec2(uTime * 0.07, -uTime * 0.045));
  float n2 = fbm(p * 3.4 - vec2(uTime * 0.05, uTime * 0.06) + audio);

  float veil = smoothstep(0.25, 0.85, n + audio * 0.45 * uIntensity);
  float ribbon = sin((p.x + n2 * 0.4) * 4.5 + uTime * 0.6 + uBass * 2.0);
  ribbon = smoothstep(0.35, 0.95, ribbon * 0.5 + 0.5 + audio * 0.3);

  vec2 d = uv - uPointer;
  float touch = exp(-dot(d, d) * 14.0) * (0.2 + uPointerDown * 0.9);

  vec3 c0 = vec3(0.05, 0.08, 0.1);
  vec3 c1 = vec3(0.12, 0.32, 0.38);
  vec3 c2 = vec3(0.55, 0.72, 0.55);
  vec3 c3 = vec3(0.85, 0.7, 0.45);

  vec3 col = c0;
  col = mix(col, c1, veil);
  col = mix(col, c2, ribbon * 0.65);
  col += c3 * touch * (0.35 + uBass);
  col += vec3(0.1, 0.18, 0.16) * uBass * uIntensity;

  // Soft vignette
  float vig = smoothstep(1.2, 0.25, length(p));
  col *= vig;

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
  const { gl, canvas, audio, haptics, host } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const hud = createHud(host);
  let intensity = 1.1;
  hud.slider("Intensity", 0.4, 2.0, intensity, (v) => {
    intensity = v;
  });

  void audio.resume().then(() => audio.startBed("aurora"));
  audio.startBed("aurora");

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

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uBass = gl.getUniformLocation(prog, "uBass");
  const uBands = gl.getUniformLocation(prog, "uBands[0]");
  const uPointer = gl.getUniformLocation(prog, "uPointer");
  const uPointerDown = gl.getUniformLocation(prog, "uPointerDown");
  const uIntensity = gl.getUniformLocation(prog, "uIntensity");

  const bands = new Float32Array(24);
  let time = 0;
  let pointerDown = false;
  let px = 0.5;
  let py = 0.5;

  const toUv = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: 1 - (clientY - rect.top) / rect.height,
    };
  };

  const onDown = (e: PointerEvent) => {
    pointerDown = true;
    const p = toUv(e.clientX, e.clientY);
    px = p.x;
    py = p.y;
    void audio.resume();
    audio.startBed("aurora");
    haptics.tap(8);
    audio.whoosh(0.25);
  };
  const onMove = (e: PointerEvent) => {
    const p = toUv(e.clientX, e.clientY);
    px = p.x;
    py = p.y;
  };
  const onUp = () => {
    pointerDown = false;
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);

  return {
    update(dt: number) {
      time += dt;
      audio.getSpectrum(bands);
      for (let i = 0; i < bands.length; i++) bands[i] *= intensity;
      const bass = audio.getBass() * intensity;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uBass, bass);
      gl.uniform1fv(uBands, bands);
      gl.uniform2f(uPointer, px, py);
      gl.uniform1f(uPointerDown, pointerDown ? 1 : 0);
      gl.uniform1f(uIntensity, intensity);

      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    destroy() {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      audio.stopBed();
      hud.destroy();
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
    },
  };
}

export const auroraVeil: WebGLExperienceModule = {
  id: "aurora-veil",
  kind: "webgl",
  name: "Aurora Veil",
  modality: "WebGL",
  tagline: "Full-screen shader veil — soft bands that breathe with sound.",
  hint: "Touch to bloom. Generative music shapes the field.",
  accent: "#8fbc8f",
  badge: "WebGL",
  mount,
};
