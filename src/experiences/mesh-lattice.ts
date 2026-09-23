import { createHud } from "@/engine/hud";
import { getSharedAudio } from "@/engine/audio";
import type {
  ExperienceHandle,
  WebGLExperienceContext,
  WebGLExperienceModule,
} from "@/engine/types";

/**
 * Mesh Lattice — WebGL2 perspective mesh.
 * Drag rotates the camera (no shape warp). Play Song drives music-reactive vertices.
 */

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aUv;
uniform mat4 uMVP;
uniform float uTime;
uniform float uBass;
uniform float uBands[32];
uniform float uMusic; // 0 = idle swell, 1 = full song reaction
out float vHeight;
out vec2 vUv;
out float vEdge;

float bandAt(float x) {
  float f = clamp(x, 0.0, 0.999) * 31.0;
  int i = int(floor(f));
  float t = fract(f);
  float a = uBands[i];
  float b = uBands[min(i + 1, 31)];
  return mix(a, b, t);
}

void main() {
  vUv = aUv;
  float x = (aUv.x - 0.5) * 2.4;
  float z = (aUv.y - 0.5) * 2.4;

  float audio = bandAt(aUv.x) * 0.7 + bandAt(aUv.y) * 0.45;
  float wave = sin(x * 2.6 + uTime * 0.7) * cos(z * 2.2 - uTime * 0.55) * 0.04;
  float pulse = sin(length(vec2(x, z)) * 3.5 - uTime * 2.4) * uBass * 0.55;

  // Music drives displacement; without song keep a gentle idle ripple only.
  float y = wave + (audio * 0.85 + pulse) * (0.15 + uMusic * 0.95);
  vHeight = y;
  vEdge = max(abs(aUv.x - 0.5), abs(aUv.y - 0.5)) * 2.0;

  gl_Position = uMVP * vec4(x, y, z, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;
in float vHeight;
in vec2 vUv;
in float vEdge;
uniform float uBass;
uniform float uMusic;
out vec4 outColor;

void main() {
  float h = clamp(vHeight * 1.8 + 0.35, 0.0, 1.6);
  vec3 deep = vec3(0.04, 0.09, 0.12);
  vec3 mid = vec3(0.18, 0.42, 0.48);
  vec3 hi = vec3(0.78, 0.92, 0.82);
  vec3 col = mix(deep, mid, smoothstep(0.0, 0.55, h));
  col = mix(col, hi, smoothstep(0.3, 1.15, h + uBass * 0.35 * uMusic));

  float gx = abs(fract(vUv.x * 28.0) - 0.5);
  float gz = abs(fract(vUv.y * 28.0) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.04, min(gx, gz));
  col += vec3(0.35, 0.55, 0.5) * line * (0.22 + uBass * 0.55 * uMusic);

  float fade = 1.0 - smoothstep(0.75, 1.05, vEdge);
  float alpha = (0.55 + h * 0.4 + line * 0.25) * fade;
  outColor = vec4(col, alpha);
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

function perspective(out: Float32Array, fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
}

function lookAt(out: Float32Array, eye: number[], center: number[], up: number[]) {
  const zx = eye[0] - center[0];
  const zy = eye[1] - center[1];
  const zz = eye[2] - center[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  const z0 = zx / len;
  const z1 = zy / len;
  const z2 = zz / len;
  let xx = up[1] * z2 - up[2] * z1;
  let xy = up[2] * z0 - up[0] * z2;
  let xz = up[0] * z1 - up[1] * z0;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len;
  xy /= len;
  xz /= len;
  const y0 = z1 * xz - z2 * xy;
  const y1 = z2 * xx - z0 * xz;
  const y2 = z0 * xy - z1 * xx;
  out[0] = xx;
  out[1] = y0;
  out[2] = z0;
  out[3] = 0;
  out[4] = xy;
  out[5] = y1;
  out[6] = z1;
  out[7] = 0;
  out[8] = xz;
  out[9] = y2;
  out[10] = z2;
  out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  out[15] = 1;
}

function mul(out: Float32Array, a: Float32Array, b: Float32Array) {
  const r = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r0 = 0; r0 < 4; r0++) {
      r[c * 4 + r0] =
        a[r0] * b[c * 4] + a[4 + r0] * b[c * 4 + 1] + a[8 + r0] * b[c * 4 + 2] + a[12 + r0] * b[c * 4 + 3];
    }
  }
  out.set(r);
}

function mount(ctx: WebGLExperienceContext): ExperienceHandle {
  const { gl, canvas, audio, haptics, host } = ctx;
  let w = ctx.width;
  let h = ctx.height;

  const shared = getSharedAudio();
  const hud = createHud(host);
  let songOn = false;

  const songToggle = hud.toggle("Stop song", "Play song", false, (on) => {
    songOn = on;
    void audio.resume();
    if (on) {
      shared.startSong();
      haptics.tap(12);
    } else {
      shared.stopSong();
      // Leave peace ambient running after stop
      void shared.unlockAndStartPeace();
    }
  });

  // Don't auto-start lattice bed (conflicts with peace / song). Keep peace until song.
  void audio.resume().then(() => shared.unlockAndStartPeace());

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = link(gl, vs, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const COLS = 48;
  const ROWS = 36;
  const verts = new Float32Array((COLS + 1) * (ROWS + 1) * 2);
  let vi = 0;
  for (let r = 0; r <= ROWS; r++) {
    for (let c = 0; c <= COLS; c++) {
      verts[vi++] = c / COLS;
      verts[vi++] = r / ROWS;
    }
  }
  const indices = new Uint32Array(COLS * ROWS * 6);
  let ii = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i0 = r * (COLS + 1) + c;
      indices[ii++] = i0;
      indices[ii++] = i0 + 1;
      indices[ii++] = i0 + COLS + 1;
      indices[ii++] = i0 + 1;
      indices[ii++] = i0 + COLS + 2;
      indices[ii++] = i0 + COLS + 1;
    }
  }

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const ibo = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  const uMVP = gl.getUniformLocation(prog, "uMVP");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uBass = gl.getUniformLocation(prog, "uBass");
  const uBands = gl.getUniformLocation(prog, "uBands[0]");
  const uMusic = gl.getUniformLocation(prog, "uMusic");

  const mvp = new Float32Array(16);
  const proj = new Float32Array(16);
  const view = new Float32Array(16);
  const bands = new Float32Array(32);

  let dragging = false;
  let yaw = 0.55;
  let pitch = 0.42;
  let time = 0;
  let lastX = 0;
  let lastY = 0;

  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
    void audio.resume();
    haptics.tap(6);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    yaw += dx * 0.008;
    pitch = Math.max(0.15, Math.min(1.15, pitch + dy * 0.006));
  };
  const onUp = () => {
    dragging = false;
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  return {
    update(dt: number) {
      time += dt;
      songOn = shared.isSongPlaying();
      songToggle.set(songOn);

      audio.getSpectrum(bands);
      const bass = audio.getBass();
      const music = songOn ? 1 : 0;

      const aspect = w / Math.max(1, h);
      perspective(proj, (48 * Math.PI) / 180, aspect, 0.1, 20);
      const eyeR = 2.45;
      const eyeY = 0.55 + pitch * 1.1 + bass * music * 0.15;
      lookAt(
        view,
        [Math.sin(yaw) * eyeR, eyeY, Math.cos(yaw) * eyeR],
        [0, 0.05 + bass * music * 0.08, 0],
        [0, 1, 0],
      );
      mul(mvp, proj, view);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.05, 0.07, 0.08, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.useProgram(prog);
      gl.uniformMatrix4fv(uMVP, false, mvp);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uBass, bass);
      gl.uniform1fv(uBands, bands);
      gl.uniform1f(uMusic, music);

      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0);
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
      if (shared.isSongPlaying()) shared.stopSong();
      else audio.stopBed();
      void shared.unlockAndStartPeace();
      hud.destroy();
      gl.deleteBuffer(vbo);
      gl.deleteBuffer(ibo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
    },
  };
}

export const meshLattice: WebGLExperienceModule = {
  id: "mesh-lattice",
  kind: "webgl",
  name: "Mesh Lattice",
  modality: "WebGL",
  tagline: "Orbit the lattice. Play a song and watch it dance.",
  hint: "Drag to rotate. Play song to drive the mesh with music.",
  accent: "#6db8b0",
  badge: "WebGL",
  mount,
};
