/**
 * Silk Fluid — GPU Navier–Stokes dye simulation.
 * Adapted from Pavel Dobryakov’s WebGL Fluid Simulation (MIT):
 * https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
 */
import type {
  ExperienceHandle,
  WebGLExperienceContext,
  WebGLExperienceModule,
} from "@/engine/types";

type FBO = {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  attach: (id: number) => number;
};

type DoubleFBO = {
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  read: FBO;
  write: FBO;
  swap: () => void;
};

type Color = { r: number; g: number; b: number };

type Pointer = {
  id: number;
  texcoordX: number;
  texcoordY: number;
  prevTexcoordX: number;
  prevTexcoordY: number;
  deltaX: number;
  deltaY: number;
  down: boolean;
  moved: boolean;
  color: Color;
};

function isMobile() {
  return /Mobi|Android/i.test(navigator.userAgent);
}

function mount(ctx: WebGLExperienceContext): ExperienceHandle {
  const { canvas, gl, audio, haptics } = ctx;

  const CONFIG = {
    SIM_RESOLUTION: 128,
    DYE_RESOLUTION: 1024,
    DENSITY_DISSIPATION: 1,
    VELOCITY_DISSIPATION: 0.2,
    PRESSURE: 0.8,
    PRESSURE_ITERATIONS: 20,
    CURL: 30,
    SPLAT_RADIUS: 0.25,
    SPLAT_FORCE: 6000,
    SHADING: true,
    COLORFUL: true,
    COLOR_UPDATE_SPEED: 10,
    BLOOM: true,
    BLOOM_ITERATIONS: 8,
    BLOOM_RESOLUTION: 256,
    BLOOM_INTENSITY: 0.8,
    BLOOM_THRESHOLD: 0.6,
    BLOOM_SOFT_KNEE: 0.7,
    SUNRAYS: true,
    SUNRAYS_RESOLUTION: 196,
    SUNRAYS_WEIGHT: 1.0,
    BACK_COLOR: { r: 0, g: 0, b: 0 },
  };

  gl.getExtension("EXT_color_buffer_float");
  gl.getExtension("OES_texture_float_linear");
  const supportLinearFiltering = !!gl.getExtension("OES_texture_float_linear");

  if (isMobile()) CONFIG.DYE_RESOLUTION = 512;
  if (!supportLinearFiltering) {
    CONFIG.DYE_RESOLUTION = 512;
    CONFIG.SHADING = false;
    CONFIG.BLOOM = false;
    CONFIG.SUNRAYS = false;
  }

  const halfFloatTexType = gl.HALF_FLOAT;

  function supportRenderTextureFormat(
    internalFormat: number,
    format: number,
    type: number,
  ) {
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(texture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return status === gl.FRAMEBUFFER_COMPLETE;
  }

  function getSupportedFormat(
    internalFormat: number,
    format: number,
    type: number,
  ): { internalFormat: number; format: number } | null {
    if (supportRenderTextureFormat(internalFormat, format, type)) {
      return { internalFormat, format };
    }
    switch (internalFormat) {
      case gl.R16F:
        return getSupportedFormat(gl.RG16F, gl.RG, type);
      case gl.RG16F:
        return getSupportedFormat(gl.RGBA16F, gl.RGBA, type);
      default:
        return null;
    }
  }

  const formatRGBAOrNull = getSupportedFormat(gl.RGBA16F, gl.RGBA, halfFloatTexType);
  const formatRGOrNull = getSupportedFormat(gl.RG16F, gl.RG, halfFloatTexType);
  const formatROrNull = getSupportedFormat(gl.R16F, gl.RED, halfFloatTexType);
  if (!formatRGBAOrNull || !formatRGOrNull || !formatROrNull) {
    throw new Error("Half-float render targets not supported");
  }
  // Narrowed consts so nested helpers close over non-null types (TS18047).
  const formatRGBA = formatRGBAOrNull;
  const formatRG = formatRGOrNull;
  const formatR = formatROrNull;

  gl.clearColor(0, 0, 0, 1);

  function compileShader(type: number, source: string, keywords: string[] | null = null) {
    // Always emit #version first — keyword #defines must never precede it.
    let body = source.replace(/^\uFEFF/, "").replace(/^#version[^\r\n]*\r?\n?/, "");
    if (keywords?.length) {
      body = `${keywords.map((k) => `#define ${k}`).join("\n")}\n${body}`;
    }
    const src = `#version 300 es\n${body}`;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "Shader compile failed");
    }
    return shader;
  }

  function createProgram(vs: WebGLShader, fs: WebGLShader) {
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, "aPosition");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Program link failed");
    }
    return program;
  }

  function getUniforms(program: WebGLProgram) {
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      if (!info) continue;
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    return uniforms;
  }

  class Program {
    program: WebGLProgram;
    uniforms: Record<string, WebGLUniformLocation | null>;
    constructor(vertexShader: WebGLShader, fragmentShader: WebGLShader) {
      this.program = createProgram(vertexShader, fragmentShader);
      this.uniforms = getUniforms(this.program);
    }
    bind() {
      gl.useProgram(this.program);
    }
  }

  class Material {
    private vertexShader: WebGLShader;
    private fragmentShaderSource: string;
    private programs = new Map<number, WebGLProgram>();
    private activeProgram: WebGLProgram | null = null;
    uniforms: Record<string, WebGLUniformLocation | null> = {};

    constructor(vertexShader: WebGLShader, fragmentShaderSource: string) {
      this.vertexShader = vertexShader;
      this.fragmentShaderSource = fragmentShaderSource;
    }

    setKeywords(keywords: string[]) {
      let hash = 0;
      for (const k of keywords) hash = ((hash << 5) - hash + hashCode(k)) | 0;
      let program = this.programs.get(hash);
      if (!program) {
        const fs = compileShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource, keywords);
        program = createProgram(this.vertexShader, fs);
        gl.deleteShader(fs);
        this.programs.set(hash, program);
      }
      if (program === this.activeProgram) return;
      this.uniforms = getUniforms(program);
      this.activeProgram = program;
    }

    bind() {
      if (this.activeProgram) gl.useProgram(this.activeProgram);
    }

    destroy() {
      for (const p of this.programs.values()) gl.deleteProgram(p);
      this.programs.clear();
    }
  }

  const baseVertexShader = compileShader(
    gl.VERTEX_SHADER,
    `#version 300 es
precision highp float;
layout(location=0) in vec2 aPosition;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`,
  );

  const blurVertexShader = compileShader(
    gl.VERTEX_SHADER,
    `#version 300 es
precision highp float;
layout(location=0) in vec2 aPosition;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  float offset = 1.33333333;
  vL = vUv - texelSize * offset;
  vR = vUv + texelSize * offset;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`,
  );

  const blurShader = compileShader(
    gl.FRAGMENT_SHADER,
    `#version 300 es
precision mediump float;
precision mediump sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
uniform sampler2D uTexture;
out vec4 fragColor;
void main () {
  vec4 sum = texture(uTexture, vUv) * 0.29411764;
  sum += texture(uTexture, vL) * 0.35294117;
  sum += texture(uTexture, vR) * 0.35294117;
  fragColor = sum;
}`,
  );

  const copyShader = compileShader(
    gl.FRAGMENT_SHADER,
    `#version 300 es
precision mediump float;
precision mediump sampler2D;
in highp vec2 vUv;
uniform sampler2D uTexture;
out vec4 fragColor;
void main () {
  fragColor = texture(uTexture, vUv);
}`,
  );

  const clearShader = compileShader(
    gl.FRAGMENT_SHADER,
    `#version 300 es
precision mediump float;
precision mediump sampler2D;
in highp vec2 vUv;
uniform sampler2D uTexture;
uniform float value;
out vec4 fragColor;
void main () {
  fragColor = value * texture(uTexture, vUv);
}`,
  );

  const colorShader = compileShader(
    gl.FRAGMENT_SHADER,
    `#version 300 es
precision mediump float;
uniform vec4 color;
out vec4 fragColor;
void main () {
  fragColor = color;
}`,
  );

  const displayShaderSource = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uTexture;
uniform sampler2D uBloom;
uniform sampler2D uSunrays;
uniform sampler2D uDithering;
uniform vec2 ditherScale;
uniform vec2 texelSize;
out vec4 fragColor;

vec3 linearToGamma (vec3 color) {
  color = max(color, vec3(0));
  return max(1.055 * pow(color, vec3(0.416666667)) - 0.055, vec3(0));
}

void main () {
  vec3 c = texture(uTexture, vUv).rgb;
#ifdef SHADING
  vec3 lc = texture(uTexture, vL).rgb;
  vec3 rc = texture(uTexture, vR).rgb;
  vec3 tc = texture(uTexture, vT).rgb;
  vec3 bc = texture(uTexture, vB).rgb;
  float dx = length(rc) - length(lc);
  float dy = length(tc) - length(bc);
  vec3 n = normalize(vec3(dx, dy, length(texelSize)));
  vec3 l = vec3(0.0, 0.0, 1.0);
  float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);
  c *= diffuse;
#endif
#ifdef BLOOM
  vec3 bloom = texture(uBloom, vUv).rgb;
#endif
#ifdef SUNRAYS
  float sunrays = texture(uSunrays, vUv).r;
  c *= sunrays;
#ifdef BLOOM
  bloom *= sunrays;
#endif
#endif
#ifdef BLOOM
  float noise = texture(uDithering, vUv * ditherScale).r;
  noise = noise * 2.0 - 1.0;
  bloom += noise / 255.0;
  bloom = linearToGamma(bloom);
  c += bloom;
#endif
  float a = max(c.r, max(c.g, c.b));
  fragColor = vec4(c, a);
}`;

  const bloomPrefilterShader = compileShader(
    gl.FRAGMENT_SHADER,
    `#version 300 es
precision mediump float;
precision mediump sampler2D;
in vec2 vUv;
uniform sampler2D uTexture;
uniform vec3 curve;
uniform float threshold;
out vec4 fragColor;
void main () {
  vec3 c = texture(uTexture, vUv).rgb;
  float br = max(c.r, max(c.g, c.b));
  float rq = clamp(br - curve.x, 0.0, curve.y);
  rq = curve.z * rq * rq;
  c *= max(rq, br - threshold) / max(br, 0.0001);
  fragColor = vec4(c, 0.0);
}`,
  );

  const bloomBlurShader = compileShader(
    gl.FRAGMENT_SHADER,
    `#version 300 es
precision mediump float;
precision mediump sampler2D;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uTexture;
out vec4 fragColor;
void main () {
  vec4 sum = vec4(0.0);
  sum += texture(uTexture, vL);
  sum += texture(uTexture, vR);
  sum += texture(uTexture, vT);
  sum += texture(uTexture, vB);
  sum *= 0.25;
  fragColor = sum;
}`,
  );

  const bloomFinalShader = compileShader(
    gl.FRAGMENT_SHADER,
    `#version 300 es
precision mediump float;
precision mediump sampler2D;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uTexture;
uniform float intensity;
out vec4 fragColor;
void main () {
  vec4 sum = vec4(0.0);
  sum += texture(uTexture, vL);
  sum += texture(uTexture, vR);
  sum += texture(uTexture, vT);
  sum += texture(uTexture, vB);
  sum *= 0.25;
  fragColor = sum * intensity;
}`,
  );

  const sunraysMaskShader = compileShader(
    gl.FRAGMENT_SHADER,
    `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uTexture;
out vec4 fragColor;
void main () {
  vec4 c = texture(uTexture, vUv);
  float br = max(c.r, max(c.g, c.b));
  c.a = 1.0 - min(max(br * 20.0, 0.0), 0.8);
  fragColor = c;
}`,
  );

  const sunraysShader = compileShader(
    gl.FRAGMENT_SHADER,
    `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uTexture;
uniform float weight;
out vec4 fragColor;
#define ITERATIONS 16
void main () {
  float Density = 0.3;
  float Decay = 0.95;
  float Exposure = 0.7;
  vec2 coord = vUv;
  vec2 dir = vUv - 0.5;
  dir *= 1.0 / float(ITERATIONS) * Density;
  float illuminationDecay = 1.0;
  float color = texture(uTexture, vUv).a;
  for (int i = 0; i < ITERATIONS; i++) {
    coord -= dir;
    float col = texture(uTexture, coord).a;
    color += col * illuminationDecay * weight;
    illuminationDecay *= Decay;
  }
  fragColor = vec4(color * Exposure, 0.0, 0.0, 1.0);
}`,
  );

  const splatShader = compileShader(
    gl.FRAGMENT_SHADER,
    `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
out vec4 fragColor;
void main () {
  vec2 p = vUv - point.xy;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture(uTarget, vUv).xyz;
  fragColor = vec4(base + splat, 1.0);
}`,
  );

  const advectionShader = compileShader(
    gl.FRAGMENT_SHADER,
    `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform vec2 dyeTexelSize;
uniform float dt;
uniform float dissipation;
out vec4 fragColor;

vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
  vec2 st = uv / tsize - 0.5;
  vec2 iuv = floor(st);
  vec2 fuv = fract(st);
  vec4 a = texture(sam, (iuv + vec2(0.5, 0.5)) * tsize);
  vec4 b = texture(sam, (iuv + vec2(1.5, 0.5)) * tsize);
  vec4 c = texture(sam, (iuv + vec2(0.5, 1.5)) * tsize);
  vec4 d = texture(sam, (iuv + vec2(1.5, 1.5)) * tsize);
  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
}

void main () {
#ifdef MANUAL_FILTERING
  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
  vec4 result = bilerp(uSource, coord, dyeTexelSize);
#else
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
  vec4 result = texture(uSource, coord);
#endif
  float decay = 1.0 + dissipation * dt;
  fragColor = result / decay;
}`,
    supportLinearFiltering ? null : ["MANUAL_FILTERING"],
  );

  const divergenceShader = compileShader(
    gl.FRAGMENT_SHADER,
    `#version 300 es
precision mediump float;
precision mediump sampler2D;
in highp vec2 vUv;
in highp vec2 vL;
in highp vec2 vR;
in highp vec2 vT;
in highp vec2 vB;
uniform sampler2D uVelocity;
out vec4 fragColor;
void main () {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}`,
  );

  const curlShader = compileShader(
    gl.FRAGMENT_SHADER,
    `#version 300 es
precision mediump float;
precision mediump sampler2D;
in highp vec2 vUv;
in highp vec2 vL;
in highp vec2 vR;
in highp vec2 vT;
in highp vec2 vB;
uniform sampler2D uVelocity;
out vec4 fragColor;
void main () {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  fragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}`,
  );

  const vorticityShader = compileShader(
    gl.FRAGMENT_SHADER,
    `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
out vec4 fragColor;
void main () {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity += force * dt;
  velocity = min(max(velocity, -1000.0), 1000.0);
  fragColor = vec4(velocity, 0.0, 1.0);
}`,
  );

  const pressureShader = compileShader(
    gl.FRAGMENT_SHADER,
    `#version 300 es
precision mediump float;
precision mediump sampler2D;
in highp vec2 vUv;
in highp vec2 vL;
in highp vec2 vR;
in highp vec2 vT;
in highp vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
out vec4 fragColor;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float divergence = texture(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}`,
  );

  const gradientSubtractShader = compileShader(
    gl.FRAGMENT_SHADER,
    `#version 300 es
precision mediump float;
precision mediump sampler2D;
in highp vec2 vUv;
in highp vec2 vL;
in highp vec2 vR;
in highp vec2 vT;
in highp vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
out vec4 fragColor;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  fragColor = vec4(velocity, 0.0, 1.0);
}`,
  );

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  const ebo = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  function blit(target: FBO | null, clear = false) {
    gl.bindVertexArray(vao);
    if (target == null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    if (clear) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }

  function createFBO(
    w: number,
    h: number,
    internalFormat: number,
    format: number,
    type: number,
    param: number,
  ): FBO {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return {
      texture,
      fbo,
      width: w,
      height: h,
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
      attach(id: number) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return id;
      },
    };
  }

  function createDoubleFBO(
    w: number,
    h: number,
    internalFormat: number,
    format: number,
    type: number,
    param: number,
  ): DoubleFBO {
    let fbo1 = createFBO(w, h, internalFormat, format, type, param);
    let fbo2 = createFBO(w, h, internalFormat, format, type, param);
    return {
      width: w,
      height: h,
      texelSizeX: fbo1.texelSizeX,
      texelSizeY: fbo1.texelSizeY,
      get read() {
        return fbo1;
      },
      set read(value) {
        fbo1 = value;
      },
      get write() {
        return fbo2;
      },
      set write(value) {
        fbo2 = value;
      },
      swap() {
        const t = fbo1;
        fbo1 = fbo2;
        fbo2 = t;
      },
    };
  }

  function deleteFBO(target: FBO) {
    gl.deleteFramebuffer(target.fbo);
    gl.deleteTexture(target.texture);
  }

  function deleteDoubleFBO(target: DoubleFBO) {
    deleteFBO(target.read);
    deleteFBO(target.write);
  }

  const blurProgram = new Program(blurVertexShader, blurShader);
  const copyProgram = new Program(baseVertexShader, copyShader);
  const clearProgram = new Program(baseVertexShader, clearShader);
  const colorProgram = new Program(baseVertexShader, colorShader);
  const bloomPrefilterProgram = new Program(baseVertexShader, bloomPrefilterShader);
  const bloomBlurProgram = new Program(baseVertexShader, bloomBlurShader);
  const bloomFinalProgram = new Program(baseVertexShader, bloomFinalShader);
  const sunraysMaskProgram = new Program(baseVertexShader, sunraysMaskShader);
  const sunraysProgram = new Program(baseVertexShader, sunraysShader);
  const splatProgram = new Program(baseVertexShader, splatShader);
  const advectionProgram = new Program(baseVertexShader, advectionShader);
  const divergenceProgram = new Program(baseVertexShader, divergenceShader);
  const curlProgram = new Program(baseVertexShader, curlShader);
  const vorticityProgram = new Program(baseVertexShader, vorticityShader);
  const pressureProgram = new Program(baseVertexShader, pressureShader);
  const gradientSubtractProgram = new Program(baseVertexShader, gradientSubtractShader);
  const displayMaterial = new Material(baseVertexShader, displayShaderSource);

  function resizeFBO(
    target: FBO,
    w: number,
    h: number,
    internalFormat: number,
    format: number,
    type: number,
    param: number,
  ) {
    const newFBO = createFBO(w, h, internalFormat, format, type, param);
    copyProgram.bind();
    gl.uniform1i(copyProgram.uniforms.uTexture, target.attach(0));
    blit(newFBO);
    deleteFBO(target);
    return newFBO;
  }

  function resizeDoubleFBO(
    target: DoubleFBO,
    w: number,
    h: number,
    internalFormat: number,
    format: number,
    type: number,
    param: number,
  ) {
    if (target.width === w && target.height === h) return target;
    target.read = resizeFBO(target.read, w, h, internalFormat, format, type, param);
    deleteFBO(target.write);
    target.write = createFBO(w, h, internalFormat, format, type, param);
    target.width = w;
    target.height = h;
    target.texelSizeX = 1 / w;
    target.texelSizeY = 1 / h;
    return target;
  }

  function getResolution(resolution: number) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) aspectRatio = 1 / aspectRatio;
    const min = Math.round(resolution);
    const max = Math.round(resolution * aspectRatio);
    if (gl.drawingBufferWidth > gl.drawingBufferHeight) {
      return { width: max, height: min };
    }
    return { width: min, height: max };
  }

  let dye!: DoubleFBO;
  let velocity!: DoubleFBO;
  let divergence!: FBO;
  let curl!: FBO;
  let pressure!: DoubleFBO;
  let bloom!: FBO;
  let bloomFramebuffers: FBO[] = [];
  let sunrays!: FBO;
  let sunraysTemp!: FBO;

  // Procedural dither noise (replaces LDR_LLL1_0.png)
  const ditherSize = 64;
  const ditherData = new Uint8Array(ditherSize * ditherSize * 3);
  for (let i = 0; i < ditherData.length; i += 3) {
    const n = (Math.random() * 255) | 0;
    ditherData[i] = n;
    ditherData[i + 1] = n;
    ditherData[i + 2] = n;
  }
  const ditherTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, ditherTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGB,
    ditherSize,
    ditherSize,
    0,
    gl.RGB,
    gl.UNSIGNED_BYTE,
    ditherData,
  );
  const ditheringTexture = {
    texture: ditherTexture,
    width: ditherSize,
    height: ditherSize,
    attach(id: number) {
      gl.activeTexture(gl.TEXTURE0 + id);
      gl.bindTexture(gl.TEXTURE_2D, ditherTexture);
      return id;
    },
  };

  function initBloomFramebuffers() {
    const res = getResolution(CONFIG.BLOOM_RESOLUTION);
    const filtering = supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    if (bloom) deleteFBO(bloom);
    for (const f of bloomFramebuffers) deleteFBO(f);
    bloomFramebuffers = [];
    bloom = createFBO(
      res.width,
      res.height,
      formatRGBA.internalFormat,
      formatRGBA.format,
      halfFloatTexType,
      filtering,
    );
    for (let i = 0; i < CONFIG.BLOOM_ITERATIONS; i++) {
      const width = res.width >> (i + 1);
      const height = res.height >> (i + 1);
      if (width < 2 || height < 2) break;
      bloomFramebuffers.push(
        createFBO(width, height, formatRGBA.internalFormat, formatRGBA.format, halfFloatTexType, filtering),
      );
    }
  }

  function initSunraysFramebuffers() {
    const res = getResolution(CONFIG.SUNRAYS_RESOLUTION);
    const filtering = supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    if (sunrays) deleteFBO(sunrays);
    if (sunraysTemp) deleteFBO(sunraysTemp);
    sunrays = createFBO(
      res.width,
      res.height,
      formatR.internalFormat,
      formatR.format,
      halfFloatTexType,
      filtering,
    );
    sunraysTemp = createFBO(
      res.width,
      res.height,
      formatR.internalFormat,
      formatR.format,
      halfFloatTexType,
      filtering,
    );
  }

  function initFramebuffers() {
    const simRes = getResolution(CONFIG.SIM_RESOLUTION);
    const dyeRes = getResolution(CONFIG.DYE_RESOLUTION);
    const filtering = supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    gl.disable(gl.BLEND);

    if (!dye) {
      dye = createDoubleFBO(
        dyeRes.width,
        dyeRes.height,
        formatRGBA.internalFormat,
        formatRGBA.format,
        halfFloatTexType,
        filtering,
      );
    } else {
      dye = resizeDoubleFBO(
        dye,
        dyeRes.width,
        dyeRes.height,
        formatRGBA.internalFormat,
        formatRGBA.format,
        halfFloatTexType,
        filtering,
      );
    }

    if (!velocity) {
      velocity = createDoubleFBO(
        simRes.width,
        simRes.height,
        formatRG.internalFormat,
        formatRG.format,
        halfFloatTexType,
        filtering,
      );
    } else {
      velocity = resizeDoubleFBO(
        velocity,
        simRes.width,
        simRes.height,
        formatRG.internalFormat,
        formatRG.format,
        halfFloatTexType,
        filtering,
      );
    }

    if (divergence) deleteFBO(divergence);
    if (curl) deleteFBO(curl);
    if (pressure) deleteDoubleFBO(pressure);

    divergence = createFBO(
      simRes.width,
      simRes.height,
      formatR.internalFormat,
      formatR.format,
      halfFloatTexType,
      gl.NEAREST,
    );
    curl = createFBO(
      simRes.width,
      simRes.height,
      formatR.internalFormat,
      formatR.format,
      halfFloatTexType,
      gl.NEAREST,
    );
    pressure = createDoubleFBO(
      simRes.width,
      simRes.height,
      formatR.internalFormat,
      formatR.format,
      halfFloatTexType,
      gl.NEAREST,
    );

    initBloomFramebuffers();
    initSunraysFramebuffers();
  }

  function updateKeywords() {
    const keywords: string[] = [];
    if (CONFIG.SHADING) keywords.push("SHADING");
    if (CONFIG.BLOOM) keywords.push("BLOOM");
    if (CONFIG.SUNRAYS) keywords.push("SUNRAYS");
    displayMaterial.setKeywords(keywords);
  }

  function HSVtoRGB(h: number, s: number, v: number): Color {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let r = 0;
    let g = 0;
    let b = 0;
    switch (i % 6) {
      case 0:
        r = v;
        g = t;
        b = p;
        break;
      case 1:
        r = q;
        g = v;
        b = p;
        break;
      case 2:
        r = p;
        g = v;
        b = t;
        break;
      case 3:
        r = p;
        g = q;
        b = v;
        break;
      case 4:
        r = t;
        g = p;
        b = v;
        break;
      case 5:
        r = v;
        g = p;
        b = q;
        break;
    }
    return { r, g, b };
  }

  function generateColor(): Color {
    const c = HSVtoRGB(Math.random(), 1, 1);
    c.r *= 0.15;
    c.g *= 0.15;
    c.b *= 0.15;
    return c;
  }

  function correctRadius(radius: number) {
    const aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1) radius *= aspectRatio;
    return radius;
  }

  function correctDeltaX(delta: number) {
    const aspectRatio = canvas.width / canvas.height;
    if (aspectRatio < 1) delta *= aspectRatio;
    return delta;
  }

  function correctDeltaY(delta: number) {
    const aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1) delta /= aspectRatio;
    return delta;
  }

  function splat(x: number, y: number, dx: number, dy: number, color: Color) {
    splatProgram.bind();
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.point, x, y);
    gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0);
    gl.uniform1f(splatProgram.uniforms.radius, correctRadius(CONFIG.SPLAT_RADIUS / 100));
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
    blit(dye.write);
    dye.swap();
  }

  function multipleSplats(amount: number) {
    for (let i = 0; i < amount; i++) {
      const color = generateColor();
      color.r *= 10;
      color.g *= 10;
      color.b *= 10;
      const x = Math.random();
      const y = Math.random();
      const dx = 1000 * (Math.random() - 0.5);
      const dy = 1000 * (Math.random() - 0.5);
      splat(x, y, dx, dy, color);
    }
  }

  function splatPointer(pointer: Pointer) {
    const dx = pointer.deltaX * CONFIG.SPLAT_FORCE;
    const dy = pointer.deltaY * CONFIG.SPLAT_FORCE;
    splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color);
  }

  function applyBloom(source: FBO, destination: FBO) {
    if (bloomFramebuffers.length < 2) return;
    let last = destination;
    gl.disable(gl.BLEND);
    bloomPrefilterProgram.bind();
    const knee = CONFIG.BLOOM_THRESHOLD * CONFIG.BLOOM_SOFT_KNEE + 0.0001;
    const curve0 = CONFIG.BLOOM_THRESHOLD - knee;
    const curve1 = knee * 2;
    const curve2 = 0.25 / knee;
    gl.uniform3f(bloomPrefilterProgram.uniforms.curve, curve0, curve1, curve2);
    gl.uniform1f(bloomPrefilterProgram.uniforms.threshold, CONFIG.BLOOM_THRESHOLD);
    gl.uniform1i(bloomPrefilterProgram.uniforms.uTexture, source.attach(0));
    blit(last);

    bloomBlurProgram.bind();
    for (let i = 0; i < bloomFramebuffers.length; i++) {
      const dest = bloomFramebuffers[i];
      gl.uniform2f(bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
      gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0));
      blit(dest);
      last = dest;
    }

    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.BLEND);
    for (let i = bloomFramebuffers.length - 2; i >= 0; i--) {
      const baseTex = bloomFramebuffers[i];
      gl.uniform2f(bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
      gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0));
      gl.viewport(0, 0, baseTex.width, baseTex.height);
      blit(baseTex);
      last = baseTex;
    }

    gl.disable(gl.BLEND);
    bloomFinalProgram.bind();
    gl.uniform2f(bloomFinalProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
    gl.uniform1i(bloomFinalProgram.uniforms.uTexture, last.attach(0));
    gl.uniform1f(bloomFinalProgram.uniforms.intensity, CONFIG.BLOOM_INTENSITY);
    blit(destination);
  }

  function applySunrays(source: FBO, mask: FBO, destination: FBO) {
    gl.disable(gl.BLEND);
    sunraysMaskProgram.bind();
    gl.uniform1i(sunraysMaskProgram.uniforms.uTexture, source.attach(0));
    blit(mask);
    sunraysProgram.bind();
    gl.uniform1f(sunraysProgram.uniforms.weight, CONFIG.SUNRAYS_WEIGHT);
    gl.uniform1i(sunraysProgram.uniforms.uTexture, mask.attach(0));
    blit(destination);
  }

  function blurTarget(target: FBO, temp: FBO, iterations: number) {
    blurProgram.bind();
    for (let i = 0; i < iterations; i++) {
      gl.uniform2f(blurProgram.uniforms.texelSize, target.texelSizeX, 0);
      gl.uniform1i(blurProgram.uniforms.uTexture, target.attach(0));
      blit(temp);
      gl.uniform2f(blurProgram.uniforms.texelSize, 0, target.texelSizeY);
      gl.uniform1i(blurProgram.uniforms.uTexture, temp.attach(0));
      blit(target);
    }
  }

  function step(dt: number) {
    gl.disable(gl.BLEND);

    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(curl);

    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
    gl.uniform1f(vorticityProgram.uniforms.curl, CONFIG.CURL);
    gl.uniform1f(vorticityProgram.uniforms.dt, dt);
    blit(velocity.write);
    velocity.swap();

    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);

    clearProgram.bind();
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value, CONFIG.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    pressureProgram.bind();
    gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
    for (let i = 0; i < CONFIG.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    gradientSubtractProgram.bind();
    gl.uniform2f(
      gradientSubtractProgram.uniforms.texelSize,
      velocity.texelSizeX,
      velocity.texelSizeY,
    );
    gl.uniform1i(gradientSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradientSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    if (!supportLinearFiltering) {
      gl.uniform2f(
        advectionProgram.uniforms.dyeTexelSize,
        velocity.texelSizeX,
        velocity.texelSizeY,
      );
    }
    const velocityId = velocity.read.attach(0);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
    gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, CONFIG.VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    if (!supportLinearFiltering) {
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
    }
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
    gl.uniform1f(advectionProgram.uniforms.dissipation, CONFIG.DENSITY_DISSIPATION);
    blit(dye.write);
    dye.swap();
  }

  function render() {
    if (CONFIG.BLOOM) applyBloom(dye.read, bloom);
    if (CONFIG.SUNRAYS) {
      applySunrays(dye.read, dye.write, sunrays);
      blurTarget(sunrays, sunraysTemp, 1);
    }

    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);

    colorProgram.bind();
    gl.uniform4f(
      colorProgram.uniforms.color,
      CONFIG.BACK_COLOR.r / 255,
      CONFIG.BACK_COLOR.g / 255,
      CONFIG.BACK_COLOR.b / 255,
      1,
    );
    blit(null);

    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    displayMaterial.bind();
    if (CONFIG.SHADING) {
      gl.uniform2f(displayMaterial.uniforms.texelSize, 1 / width, 1 / height);
    }
    gl.uniform1i(displayMaterial.uniforms.uTexture, dye.read.attach(0));
    if (CONFIG.BLOOM) {
      gl.uniform1i(displayMaterial.uniforms.uBloom, bloom.attach(1));
      gl.uniform1i(displayMaterial.uniforms.uDithering, ditheringTexture.attach(2));
      gl.uniform2f(
        displayMaterial.uniforms.ditherScale,
        width / ditheringTexture.width,
        height / ditheringTexture.height,
      );
    }
    if (CONFIG.SUNRAYS) {
      gl.uniform1i(displayMaterial.uniforms.uSunrays, sunrays.attach(3));
    }
    blit(null);
  }

  function makePointer(): Pointer {
    return {
      id: -1,
      texcoordX: 0,
      texcoordY: 0,
      prevTexcoordX: 0,
      prevTexcoordY: 0,
      deltaX: 0,
      deltaY: 0,
      down: false,
      moved: false,
      color: generateColor(),
    };
  }

  const pointers: Pointer[] = [makePointer()];
  let colorUpdateTimer = 0;
  let lastWhoosh = 0;
  let needsResize = false;

  function posFromEvent(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  }

  function updatePointerDown(pointer: Pointer, id: number, posX: number, posY: number) {
    pointer.id = id;
    pointer.down = true;
    pointer.moved = false;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1 - posY / canvas.height;
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.deltaX = 0;
    pointer.deltaY = 0;
    pointer.color = generateColor();
  }

  function updatePointerMove(pointer: Pointer, posX: number, posY: number) {
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1 - posY / canvas.height;
    pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
    pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
    pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
  }

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    const pos = posFromEvent(e);
    let pointer = pointers.find((p) => p.id === e.pointerId || (!p.down && p.id === -1));
    if (!pointer) {
      pointer = makePointer();
      pointers.push(pointer);
    }
    updatePointerDown(pointer, e.pointerId, pos.x, pos.y);
    // Seed a splat so a tap leaves ink even without movement
    const color = pointer.color;
    splat(pointer.texcoordX, pointer.texcoordY, 10, 10, {
      r: color.r * 10,
      g: color.g * 10,
      b: color.b * 10,
    });
    audio.silk(0.45);
    haptics.tap(8);
  };

  const onMove = (e: PointerEvent) => {
    const pointer = pointers.find((p) => p.id === e.pointerId && p.down);
    if (!pointer) return;
    const pos = posFromEvent(e);
    updatePointerMove(pointer, pos.x, pos.y);
    if (pointer.moved) {
      const now = performance.now();
      if (now - lastWhoosh > 55) {
        const speed = Math.hypot(pointer.deltaX, pointer.deltaY);
        audio.silk(Math.min(0.95, 0.35 + speed * 10));
        lastWhoosh = now;
      }
    }
  };

  const onUp = (e: PointerEvent) => {
    const pointer = pointers.find((p) => p.id === e.pointerId);
    if (pointer) {
      pointer.down = false;
      pointer.id = -1;
    }
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);

  updateKeywords();
  initFramebuffers();
  multipleSplats(((Math.random() * 20) | 0) + 5);

  return {
    update(dt: number) {
      const clamped = Math.min(dt, 1 / 60);
      if (needsResize) {
        initFramebuffers();
        needsResize = false;
      }

      if (CONFIG.COLORFUL) {
        colorUpdateTimer += clamped * CONFIG.COLOR_UPDATE_SPEED;
        if (colorUpdateTimer >= 1) {
          colorUpdateTimer = colorUpdateTimer % 1;
          for (const p of pointers) p.color = generateColor();
        }
      }

      for (const p of pointers) {
        if (p.moved) {
          p.moved = false;
          splatPointer(p);
        }
      }

      step(clamped);
      render();
    },
    resize() {
      needsResize = true;
    },
    destroy() {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      deleteDoubleFBO(dye);
      deleteDoubleFBO(velocity);
      deleteFBO(divergence);
      deleteFBO(curl);
      deleteDoubleFBO(pressure);
      if (bloom) deleteFBO(bloom);
      for (const f of bloomFramebuffers) deleteFBO(f);
      if (sunrays) deleteFBO(sunrays);
      if (sunraysTemp) deleteFBO(sunraysTemp);
      gl.deleteTexture(ditherTexture);

      const programs = [
        blurProgram,
        copyProgram,
        clearProgram,
        colorProgram,
        bloomPrefilterProgram,
        bloomBlurProgram,
        bloomFinalProgram,
        sunraysMaskProgram,
        sunraysProgram,
        splatProgram,
        advectionProgram,
        divergenceProgram,
        curlProgram,
        vorticityProgram,
        pressureProgram,
        gradientSubtractProgram,
      ];
      for (const p of programs) gl.deleteProgram(p.program);
      displayMaterial.destroy();

      const shaders = [
        baseVertexShader,
        blurVertexShader,
        blurShader,
        copyShader,
        clearShader,
        colorShader,
        bloomPrefilterShader,
        bloomBlurShader,
        bloomFinalShader,
        sunraysMaskShader,
        sunraysShader,
        splatShader,
        advectionShader,
        divergenceShader,
        curlShader,
        vorticityShader,
        pressureShader,
        gradientSubtractShader,
      ];
      for (const s of shaders) gl.deleteShader(s);

      gl.deleteBuffer(vbo);
      gl.deleteBuffer(ebo);
      gl.deleteVertexArray(vao);
    },
  };
}

function hashCode(s: string) {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export const silkFluid: WebGLExperienceModule = {
  kind: "webgl",
  id: "silk-fluid",
  name: "Silk Fluid",
  modality: "Fluid",
  tagline: "Drag colorful dye through a living fluid field.",
  hint: "Drag to splash and swirl. Colors bloom as they flow.",
  accent: "#6db3a8",
  badge: "WebGL",
  mount,
};
