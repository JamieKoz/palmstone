import type {
  ExperienceHandle,
  WebGLExperienceContext,
  WebGLExperienceModule,
} from "@/engine/types";

/**
 * Stone Polish — WebGL gym-badge gem.
 * Rubbing clears grit slowly. A moving specular band keeps rewarding the whole session.
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
uniform sampler2D uPolish;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform vec2 uRadius;
uniform float uTime;
uniform float uSheen;
uniform float uSweep;
uniform vec2 uFinger;
uniform float uFingerOn;
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
    p *= 2.07;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  vec2 q = (px - uCenter) / uRadius;
  float r = length(q);
  float ang = atan(q.y, q.x);

  vec3 bg = vec3(0.045, 0.04, 0.035);
  float vig = smoothstep(1.25, 0.2, length(vUv - 0.5));
  bg *= 0.55 + 0.45 * vig;
  bg += 0.015 * fbm(vUv * 8.0 + uTime * 0.02);

  vec3 col = bg;

  float bezel = smoothstep(1.22, 1.12, r) * smoothstep(0.98, 1.06, r);
  vec3 gold = vec3(0.62, 0.48, 0.24);
  vec3 goldHi = vec3(0.95, 0.82, 0.48);
  float bezelLight = pow(max(0.0, dot(normalize(q + vec2(0.2, -0.35)), vec2(0.0, -1.0))), 2.0);
  col = mix(col, mix(gold * 0.45, goldHi, bezelLight), bezel);

  if (r < 1.02) {
    vec2 gemUv = q * 0.5 + 0.5;
    float polish = texture(uPolish, gemUv).r;
    polish = smoothstep(0.02, 0.98, polish);

    float sector = floor((ang + 3.14159265) / (3.14159265 / 4.0));
    float facetWave = cos(sector + ang * 8.0);
    vec3 n = normalize(vec3(q * (0.55 + facetWave * 0.12), 0.42 + 0.25 * facetWave));

    float gritN = fbm(q * 18.0 + sector * 1.7);
    float gritFine = fbm(q * 46.0);
    float rough = mix(gritN, gritFine, 0.45) * (1.0 - polish);

    vec3 matte = vec3(0.13, 0.1, 0.08) + rough * vec3(0.28, 0.2, 0.12);
    vec3 satin = vec3(0.72, 0.62, 0.42);
    vec3 mirror = vec3(0.97, 0.95, 0.88);
    vec3 base = mix(matte, satin, smoothstep(0.0, 0.22, polish));
    base = mix(base, mirror, smoothstep(0.35, 1.0, polish));

    vec2 sheenDir = vec2(cos(uSheen), sin(uSheen));
    float along = dot(q, sheenDir);
    float band = exp(-pow(along - 0.08, 2.0) / (0.01 + (1.0 - polish) * 0.08));
    band *= polish;
    band = mix(band, pow(band, 0.65), uSweep);

    vec3 light = normalize(vec3(sheenDir, 0.72));
    float spec = pow(max(dot(n, light), 0.0), mix(12.0, 80.0, polish));
    spec *= polish;

    float env = fbm(reflect(vec3(q, 0.4), n).xy * 3.0 + uTime * 0.04);
    base += vec3(0.15, 0.18, 0.22) * env * polish * 0.45;

    col = base;
    col += vec3(1.0, 0.96, 0.86) * spec * 0.85;
    col += vec3(1.0, 0.97, 0.9) * band;

    float tw = hash(floor(q * 42.0) + sector);
    float glint = smoothstep(0.92, 1.0, sin(tw * 30.0 + uTime * (4.0 + polish * 6.0)));
    col += vec3(1.0, 0.95, 0.8) * glint * polish * polish * 0.9;

    float edge = smoothstep(1.0, 0.86, r);
    col *= edge;
    col += goldHi * (1.0 - edge) * smoothstep(1.05, 0.92, r) * 0.35;

    float shadow = smoothstep(1.15, 0.98, r) * 0.35;
    col = mix(bg, col, smoothstep(1.01, 0.9, r));
    col -= shadow * 0.15;
  }

  if (uFingerOn > 0.5) {
    float d = length(px - uFinger);
    float ring = smoothstep(28.0, 22.0, d) * smoothstep(10.0, 18.0, d);
    col += vec3(0.9, 0.84, 0.7) * ring * 0.45;
  }

  outColor = vec4(col, 1.0);
}
`;

const SPARK_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in float aLife;
uniform vec2 uRes;
out float vLife;
void main() {
  vec2 clip = vec2(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = mix(2.0, 7.0, aLife);
  vLife = aLife;
}
`;

const SPARK_FRAG = `#version 300 es
precision highp float;
in float vLife;
out vec4 outColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  float a = (1.0 - d) * vLife;
  outColor = vec4(1.0, 0.96, 0.86, a);
}
`;

type Spark = { x: number; y: number; vx: number; vy: number; life: number };

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

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = link(gl, vs, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  const svs = compile(gl, gl.VERTEX_SHADER, SPARK_VERT);
  const sfs = compile(gl, gl.FRAGMENT_SHADER, SPARK_FRAG);
  const sparkProg = link(gl, svs, sfs);
  gl.deleteShader(svs);
  gl.deleteShader(sfs);

  const quad = gl.createVertexArray()!;
  gl.bindVertexArray(quad);
  const quadBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const TW = 192;
  const TH = 192;
  const polish = new Float32Array(TW * TH);
  const bytes = new Uint8Array(TW * TH);
  for (let i = 0; i < polish.length; i++) polish[i] = Math.random() * 0.02;

  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, TW, TH, 0, gl.RED, gl.UNSIGNED_BYTE, bytes);
  gl.bindTexture(gl.TEXTURE_2D, null);

  const loc = {
    polish: gl.getUniformLocation(prog, "uPolish"),
    res: gl.getUniformLocation(prog, "uRes"),
    center: gl.getUniformLocation(prog, "uCenter"),
    radius: gl.getUniformLocation(prog, "uRadius"),
    time: gl.getUniformLocation(prog, "uTime"),
    sheen: gl.getUniformLocation(prog, "uSheen"),
    sweep: gl.getUniformLocation(prog, "uSweep"),
    finger: gl.getUniformLocation(prog, "uFinger"),
    fingerOn: gl.getUniformLocation(prog, "uFingerOn"),
  };
  const sparkLoc = {
    res: gl.getUniformLocation(sparkProg, "uRes"),
  };

  const sparkVao = gl.createVertexArray()!;
  const sparkBuf = gl.createBuffer()!;
  gl.bindVertexArray(sparkVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, sparkBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
  gl.bindVertexArray(null);

  const sparks: Spark[] = [];
  const sparkData = new Float32Array(48 * 3);

  let pointerDown = false;
  let px = 0;
  let py = 0;
  let lpx = 0;
  let lpy = 0;
  let sheen = -0.7;
  let sweep = 0;
  let swept = false;
  let time = 0;
  let rubAcc = 0;
  let chimeAcc = 0;

  const toLocal = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / Math.max(rect.width, 1)) * w,
      y: ((clientY - rect.top) / Math.max(rect.height, 1)) * h,
    };
  };

  const gem = () => {
    const rx = Math.min(w, h) * 0.28;
    const ry = rx * 0.94;
    return { cx: w * 0.5, cy: h * 0.5, rx, ry };
  };

  const onDown = (e: PointerEvent) => {
    pointerDown = true;
    const p = toLocal(e.clientX, e.clientY);
    px = lpx = p.x;
    py = lpy = p.y;
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

  const upload = () => {
    for (let i = 0; i < polish.length; i++) bytes[i] = Math.max(0, Math.min(255, polish[i] * 255));
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TW, TH, gl.RED, gl.UNSIGNED_BYTE, bytes);
  };

  return {
    update(dt: number) {
      time += dt;
      const { cx, cy, rx, ry } = gem();
      const speed = Math.hypot(px - lpx, py - lpy) / Math.max(dt, 0.001);
      const nx = (px - cx) / rx;
      const ny = (py - cy) / ry;
      const inside = nx * nx + ny * ny <= 1.05;

      if (pointerDown && inside) {
        sheen += ((px - lpx) / Math.max(w, 1)) * 2.2;
        const speedMul = 0.4 + Math.min(1, speed / 420) * 0.9;
        const brush = 0.2;
        let touched = 0;
        let gained = 0;
        const minC = Math.max(0, Math.floor(((nx - brush) * 0.5 + 0.5) * TW) - 1);
        const maxC = Math.min(TW - 1, Math.ceil(((nx + brush) * 0.5 + 0.5) * TW) + 1);
        const minR = Math.max(0, Math.floor(((ny - brush) * 0.5 + 0.5) * TH) - 1);
        const maxR = Math.min(TH - 1, Math.ceil(((ny + brush) * 0.5 + 0.5) * TH) + 1);
        for (let row = minR; row <= maxR; row++) {
          for (let col = minC; col <= maxC; col++) {
            const u = (col + 0.5) / TW;
            const v = (row + 0.5) / TH;
            const gx = (u * 2 - 1);
            const gy = (v * 2 - 1);
            if (gx * gx + gy * gy > 1) continue;
            const d = Math.hypot(gx - nx, gy - ny);
            const fall = 1 - d / brush;
            if (fall <= 0) continue;
            const i = row * TW + col;
            const before = polish[i];
            const add = 0.235 * dt * fall * fall * speedMul;
            polish[i] = Math.min(1, before + add);
            gained += polish[i] - before;
            if (before < 0.72 && polish[i] >= 0.72) {
              touched += 1;
              burst(sparks, cx + gx * rx, cy + gy * ry);
            }
          }
        }
        rubAcc += gained;
        if (touched > 0) {
          chimeAcc += touched;
        }
        if (chimeAcc >= 1 && rubAcc > 0.01) {
          const avgHere = sampleAverage(polish, TW, TH);
          audio.tone(720 + avgHere * 640, 0.18 + avgHere * 0.15, 0.08);
          haptics.tap(5);
          chimeAcc = 0;
        }
        if (rubAcc > 0.08) {
          let sum = 0;
          let n = 0;
          for (let i = 0; i < polish.length; i += 8) {
            sum += polish[i];
            n += 1;
          }
          const avg = sum / n;
          audio.grain(0.28 * (1 - avg * 0.75) + 0.08, 0.35 + avg * 1.25);
          if (speed > 80) haptics.tap(Math.max(3, Math.floor(10 * (1 - avg))));
          rubAcc = 0;
        }
      }

      let sum = 0;
      for (let i = 0; i < polish.length; i += 4) sum += polish[i];
      const avg = sum / (polish.length / 4);
      if (!swept && avg > 0.86) {
        swept = true;
        sweep = 1;
        audio.tone(640, 0.55, 0.6);
        audio.tone(980, 0.35, 0.45);
        haptics.pattern([10, 30, 14, 40, 18]);
        burst(sparks, cx, cy);
        burst(sparks, cx - rx * 0.4, cy - ry * 0.2);
        burst(sparks, cx + rx * 0.35, cy + ry * 0.15);
      }
      if (sweep > 0) {
        sheen += dt * 4.2;
        sweep = Math.max(0, sweep - dt * 0.35);
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life -= dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.life <= 0) sparks.splice(i, 1);
      }

      lpx = px;
      lpy = py;

      const dprW = canvas.width;
      const dprH = canvas.height;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, dprW, dprH);
      gl.disable(gl.BLEND);
      upload();
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc.polish, 0);
      gl.uniform2f(loc.res, w, h);
      gl.uniform2f(loc.center, cx, cy);
      gl.uniform2f(loc.radius, rx, ry);
      gl.uniform1f(loc.time, time);
      gl.uniform1f(loc.sheen, sheen);
      gl.uniform1f(loc.sweep, sweep);
      gl.uniform2f(loc.finger, px, py);
      gl.uniform1f(loc.fingerOn, pointerDown && inside ? 1 : 0);
      gl.bindVertexArray(quad);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);

      if (sparks.length > 0) {
        const n = Math.min(sparks.length, 48);
        for (let i = 0; i < n; i++) {
          const s = sparks[sparks.length - n + i];
          sparkData[i * 3] = s.x;
          sparkData[i * 3 + 1] = s.y;
          sparkData[i * 3 + 2] = Math.max(0, s.life / 0.7);
        }
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.useProgram(sparkProg);
        gl.uniform2f(sparkLoc.res, w, h);
        gl.bindVertexArray(sparkVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, sparkBuf);
        gl.bufferData(gl.ARRAY_BUFFER, sparkData.subarray(0, n * 3), gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.POINTS, 0, n);
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
      }
    },
    resize(nw: number, nh: number) {
      w = nw;
      h = nh;
    },
    destroy() {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      gl.deleteTexture(tex);
      gl.deleteBuffer(quadBuf);
      gl.deleteBuffer(sparkBuf);
      gl.deleteVertexArray(quad);
      gl.deleteVertexArray(sparkVao);
      gl.deleteProgram(prog);
      gl.deleteProgram(sparkProg);
    },
  };
}

function sampleAverage(polish: Float32Array, tw: number, th: number) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < tw * th; i += 6) {
    sum += polish[i];
    n += 1;
  }
  return sum / Math.max(1, n);
}

function burst(sparks: Spark[], x: number, y: number) {
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 20 + Math.random() * 70;
    sparks.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.35 + Math.random() * 0.35,
    });
    if (sparks.length > 64) sparks.shift();
  }
}

export const stonePolish: WebGLExperienceModule = {
  id: "stone-polish",
  collection: "studio",
  kind: "webgl",
  name: "Stone Polish",
  modality: "Texture",
  tagline: "Rub the badge — grit falls away and the shine sweeps across.",
  hint: "Keep rubbing. The mirror builds slowly, then the whole badge flashes.",
  accent: "#a89a84",
  badge: "WebGL",
  mount,
};
