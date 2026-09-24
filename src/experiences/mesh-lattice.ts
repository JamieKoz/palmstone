import { createHud } from "@/engine/hud";
import { getSharedAudio } from "@/engine/audio";
import { searchSongs, type SongHit } from "@/engine/songSearch";
import type {
  ExperienceHandle,
  WebGLExperienceContext,
  WebGLExperienceModule,
} from "@/engine/types";

/**
 * Mesh Lattice — vizz Mesh Grid (Circle Shape + Radial Mix 1).
 * Levels from the reference preset:
 *   Grid 177, Wave Height 1.6, Speed 2.5, Complexity 1.0,
 *   Color Intensity 2, Color Reactivity 1, Motion Dampening 0.95,
 *   Jaggedness 0.15, Flowing Noise 0, Noise Scale 0.10.
 */

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aUv; // x = radius 0..1, y = angle 0..1
uniform mat4 uMVP;
uniform float uTime;
uniform float uBass;
uniform float uBands[64];
uniform float uMusic;
uniform float uSnare;
out float vHeight;
out float vEnergy;
out float vRadius;

float bandAt(float x) {
  float f = clamp(x, 0.0, 0.999) * 63.0;
  int i = int(floor(f));
  float t = fract(f);
  float a = uBands[i];
  float b = uBands[min(i + 1, 63)];
  return mix(a, b, t);
}

float softBand(float x) {
  // Lighter blur — keep musical punch (vizz feels snappier than a wide soft kernel).
  float s = 0.0;
  float wsum = 0.0;
  for (int k = -1; k <= 1; k++) {
    float w = 1.0 - abs(float(k)) * 0.35;
    s += bandAt(x + float(k) * 0.008) * w;
    wsum += w;
  }
  return s / wsum;
}

void main() {
  // --- vizz preset levels, music-led displacement ---
  float globalSensitivity = 1.05;
  float waveHeight = 1.6;
  float waveSpeed = 2.5;
  float waveComplexity = 1.0;
  float jaggedness = 0.15;
  float flowingNoise = 0.0;
  float noiseScale = 0.10;
  float radialMix = 1.0;
  float amp = 0.62;

  float rad = aUv.x;
  float ang = aUv.y * 6.28318530718;
  float discR = 9.6;
  float x = cos(ang) * rad * discR;
  float z = sin(ang) * rad * discR;

  // Continuous angle proxies — NEVER sample bands with raw aUv.y (seam tear).
  float angU = 0.5 + 0.5 * sin(ang);
  float angV = 0.5 + 0.5 * cos(ang);

  float radialAudio = softBand(rad);
  float tangential = softBand(angU);
  float spectrum = mix(tangential, radialAudio, radialMix) * globalSensitivity;
  spectrum = clamp(spectrum, 0.0, 1.0);
  float inward = softBand(rad * 0.72);
  float cross = softBand(fract(rad * 0.55 + angV * 0.45));
  float rimEnergy = max(spectrum, mix(inward, spectrum, 0.4));
  rimEnergy = max(rimEnergy, cross * 0.75);
  rimEnergy = max(rimEnergy, uBass * 0.45);
  rimEnergy = pow(rimEnergy, 0.92);

  // Base ripples — phase + amp driven hard by music (not free-running).
  float freq = 6.0 + waveComplexity * 6.0;
  float wave =
    sin(rad * freq - uTime * waveSpeed - uBass * 2.2) * 0.55 +
    sin(rad * (freq * 1.55) - uTime * waveSpeed * 0.72 - uBass * 1.2 + 1.2) * 0.3 +
    sin(rad * 18.0 - uTime * (waveSpeed * 1.25) - rimEnergy * 2.2) * 0.28;
  wave *= 0.25 + rimEnergy * 0.95;
  wave *= 0.4 + uBass * 0.3 + rimEnergy * 0.4;

  // Extra music spikes from local spectrum differences.
  float jag =
    sin(rad * 30.0 + ang * 9.0) * cos(ang * 8.0 - rad * 20.0);
  jag *= jaggedness * (0.4 + rimEnergy * 1.1);
  float peak = max(0.0, cross - radialAudio * 0.65);
  jag += peak * 0.4;

  float snareZone = smoothstep(0.15, 0.45, rad) * (1.0 - smoothstep(0.7, 0.95, rad));
  jag *= 1.0 + uSnare * 0.35 * snareZone;

  float nFlow = sin(rad * 14.0 + ang * 5.0 + uTime * 0.1 * flowingNoise);
  float noise = nFlow * noiseScale * rimEnergy * (0.2 + flowingNoise);

  float lift =
    (rimEnergy * 0.85 + wave * 0.75 + jag * 1.0 + noise) * waveHeight * amp;
  lift *= uMusic;
  lift *= 1.0 + uSnare * 0.12 * snareZone;
  lift *= mix(1.0, 1.06, smoothstep(0.5, 1.0, rad));

  float idle = sin(rad * 7.0 - uTime * 0.5) * 0.025;
  float y = -rad * rad * 0.12 + mix(idle, lift, clamp(uMusic, 0.0, 1.0));
  y -= smoothstep(0.94, 1.0, rad) * 0.22;

  vHeight = clamp(lift / max(waveHeight * amp, 0.001), 0.0, 1.0);
  vEnergy = clamp(rimEnergy, 0.0, 1.0);
  vRadius = rad;
  gl_Position = uMVP * vec4(x, y, z, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;
in float vHeight;
in float vEnergy;
in float vRadius;
uniform float uBass;
uniform float uMusic;
uniform float uSnare;
uniform float uWire;
out vec4 outColor;

// Deep purples → blues → pinks (saturated neon).
vec3 heightRamp(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.16, 0.02, 0.38); // deep purple
  vec3 c1 = vec3(0.28, 0.06, 0.72); // violet
  vec3 c2 = vec3(0.1, 0.2, 0.9);    // deep blue
  vec3 c3 = vec3(0.4, 0.25, 0.98);  // bright purple-blue
  vec3 c4 = vec3(0.95, 0.18, 0.7);  // pink
  vec3 col = mix(c0, c1, smoothstep(0.0, 0.22, t));
  col = mix(col, c2, smoothstep(0.18, 0.45, t));
  col = mix(col, c3, smoothstep(0.4, 0.68, t));
  col = mix(col, c4, smoothstep(0.62, 1.0, t));
  return col;
}

void main() {
  float colorIntensity = 1.75;
  float colorReactivity = 0.95;

  float heat = clamp(vHeight * 0.4 + vEnergy * 0.35, 0.0, 1.0);
  float react = heat * colorReactivity * uMusic;

  // Bias toward radius so outer disc stays deep purple even when peaks are hot.
  float t = clamp(vRadius * 0.65 + heat * 0.3, 0.0, 1.0);
  vec3 col = heightRamp(t);

  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 1.25);
  col = max(col, vec3(0.0));

  float boost = 0.75 + colorIntensity * 0.12 * (0.55 + react * 0.3);
  col *= boost;
  col = min(col, vec3(1.05));

  float center = 1.0 - smoothstep(0.0, 0.3, vRadius);
  col = mix(col, vec3(0.48, 0.18, 0.95), center * uBass * uMusic * 0.22);

  // Snare — gated pink/cyan accent (must not wash the whole disc white).
  float snareFlash = smoothstep(0.5, 0.88, uSnare) * uMusic;
  vec3 snareCol = vec3(0.85, 0.35, 0.95);
  col = mix(col, snareCol, snareFlash * 0.45);
  col *= 1.0 + snareFlash * 0.28;

  if (uWire > 0.5) {
    float glow = 0.48 + react * 0.35 + snareFlash * 0.3;
    outColor = vec4(col, clamp(glow, 0.4, 1.0));
    return;
  }

  outColor = vec4(col * 0.07, 0.035);
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
  let searchSeq = 0;
  let lastPlayingKey = "";
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 320;

  const panel = document.createElement("div");
  panel.className = "song-search";
  panel.addEventListener("pointerdown", (e) => e.stopPropagation());
  panel.addEventListener("pointermove", (e) => e.stopPropagation());

  const row = document.createElement("div");
  row.className = "song-search__row";

  const input = document.createElement("input");
  input.type = "search";
  input.className = "song-search__input";
  input.placeholder = "Search songs…";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", "Search songs");

  const demoBtn = document.createElement("button");
  demoBtn.type = "button";
  demoBtn.className = "experience-hud__btn";
  demoBtn.textContent = "Demo";
  demoBtn.title = "Toggle demo track";
  demoBtn.setAttribute("aria-pressed", "false");

  const DEMO_TRACK_ID = -9001;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const demoHit: SongHit = {
    id: DEMO_TRACK_ID,
    title: "Undercurrents of Stillness",
    artist: "Demo",
    previewUrl: `${basePath}/audio/undercurrents-of-stillness.mp3`,
    artworkUrl: null,
    trackViewUrl: null,
    loop: true,
  };

  const nowPlaying = document.createElement("div");
  nowPlaying.className = "song-search__now";
  nowPlaying.hidden = true;

  const status = document.createElement("p");
  status.className = "song-search__status";
  status.textContent = "Search a song — 30s preview drives the lattice.";

  const results = document.createElement("div");
  results.className = "song-search__results";
  results.setAttribute("role", "listbox");
  results.setAttribute("aria-label", "Song search results");

  row.append(input, demoBtn);
  panel.append(row, nowPlaying, status, results);
  hud.el.appendChild(panel);
  hud.el.classList.add("experience-hud--song", "experience-hud--song-top");

  const syncPlayingUi = () => {
    songOn = shared.isSongPlaying();
    const track = shared.getPlayingTrack();
    const isDemo = Boolean(track && track.id === DEMO_TRACK_ID);
    const key = songOn ? (track ? `t:${track.id}` : "off") : "off";
    if (key === lastPlayingKey) return;
    lastPlayingKey = key;

    demoBtn.classList.toggle("is-active", isDemo);
    demoBtn.setAttribute("aria-pressed", isDemo ? "true" : "false");
    demoBtn.textContent = isDemo ? "Stop demo" : "Demo";

    if (songOn && track) {
      nowPlaying.hidden = false;
      nowPlaying.innerHTML = "";
      if (track.artworkUrl) {
        const img = document.createElement("img");
        img.src = track.artworkUrl;
        img.alt = "";
        img.className = "song-search__art";
        nowPlaying.appendChild(img);
      }
      const meta = document.createElement("div");
      meta.className = "song-search__meta";
      const title = document.createElement("strong");
      title.textContent = track.title;
      const artist = document.createElement("span");
      artist.textContent = track.artist;
      meta.append(title, artist);
      nowPlaying.appendChild(meta);
      if (track.trackViewUrl) {
        const link = document.createElement("a");
        link.href = track.trackViewUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "song-search__store";
        link.textContent = "Deezer";
        link.addEventListener("click", (e) => e.stopPropagation());
        nowPlaying.appendChild(link);
      }
      if (!isDemo) {
        const stopTrack = document.createElement("button");
        stopTrack.type = "button";
        stopTrack.className = "song-search__stop-track";
        stopTrack.textContent = "Stop";
        stopTrack.title = "Stop preview";
        stopTrack.addEventListener("click", (e) => {
          e.stopPropagation();
          stopMusic();
          status.textContent = "Search a song — 30s preview drives the lattice.";
        });
        nowPlaying.appendChild(stopTrack);
      }
    } else {
      nowPlaying.hidden = true;
      nowPlaying.textContent = "";
    }
  };

  const stopMusic = () => {
    shared.stopSong();
    void shared.unlockAndStartPeace();
    lastPlayingKey = "";
    syncPlayingUi();
  };

  const playHit = async (hit: SongHit) => {
    void audio.resume();
    status.textContent = `Loading ${hit.title}…`;
    try {
      await shared.playTrackPreview(hit);
      haptics.tap(12);
      status.textContent = "Preview playing — lattice follows the mix.";
      results.replaceChildren();
      input.blur();
      lastPlayingKey = "";
      syncPlayingUi();
    } catch {
      status.textContent = "Couldn’t play that preview. Try another track.";
      syncPlayingUi();
    }
  };

  const runSearch = async () => {
    const q = input.value.trim();
    if (!q) {
      results.replaceChildren();
      status.textContent = "Search a song — 30s preview drives the lattice.";
      return;
    }
    const seq = ++searchSeq;
    status.textContent = "Searching…";
    try {
      const hits = await searchSongs(q, 12);
      if (seq !== searchSeq) return;
      results.replaceChildren();
      if (!hits.length) {
        status.textContent = "No previews found. Try a different search.";
        return;
      }
      status.textContent = `${hits.length} track${hits.length === 1 ? "" : "s"} — tap to play.`;
      for (const hit of hits) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "song-search__hit";
        btn.setAttribute("role", "option");
        if (hit.artworkUrl) {
          const img = document.createElement("img");
          img.src = hit.artworkUrl;
          img.alt = "";
          img.loading = "lazy";
          btn.appendChild(img);
        }
        const text = document.createElement("span");
        text.className = "song-search__hit-text";
        const t = document.createElement("strong");
        t.textContent = hit.title;
        const a = document.createElement("span");
        a.textContent = hit.artist;
        text.append(t, a);
        btn.appendChild(text);
        btn.addEventListener("click", () => {
          void playHit(hit);
        });
        results.appendChild(btn);
      }
    } catch {
      if (seq !== searchSeq) return;
      status.textContent = "Search failed. Check your connection and try again.";
    }
  };

  const scheduleSearch = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (!q) {
      searchSeq += 1;
      results.replaceChildren();
      status.textContent = "Search a song — 30s preview drives the lattice.";
      return;
    }
    status.textContent = "Searching…";
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void runSearch();
    }, DEBOUNCE_MS);
  };

  input.addEventListener("input", scheduleSearch);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
      void runSearch();
    }
  });
  demoBtn.addEventListener("click", () => {
    void (async () => {
      void audio.resume();
      const track = shared.getPlayingTrack();
      if (shared.isSongPlaying() && track?.id === DEMO_TRACK_ID) {
        stopMusic();
        status.textContent = "Search a song — 30s preview drives the lattice.";
        return;
      }
      status.textContent = "Loading demo…";
      results.replaceChildren();
      try {
        await shared.playTrackPreview(demoHit);
        haptics.tap(12);
        status.textContent = "Demo playing — click again to stop.";
        lastPlayingKey = "";
        syncPlayingUi();
      } catch {
        status.textContent = "Couldn’t play the demo track.";
        lastPlayingKey = "";
        syncPlayingUi();
      }
    })();
  });

  // Keep peace ambient until a song starts.
  void audio.resume().then(() => shared.unlockAndStartPeace());
  syncPlayingUi();

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = link(gl, vs, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  // Polar disc: rings × segments (circular silhouette like vizz).
  const RINGS = 176;
  const SEGS = 176;
  const verts = new Float32Array((RINGS + 1) * SEGS * 2);
  let vi = 0;
  for (let ring = 0; ring <= RINGS; ring++) {
    const rr = ring / RINGS;
    for (let seg = 0; seg < SEGS; seg++) {
      verts[vi++] = rr;
      verts[vi++] = seg / SEGS;
    }
  }

  const indices = new Uint32Array(RINGS * SEGS * 6);
  let ii = 0;
  for (let ring = 0; ring < RINGS; ring++) {
    for (let seg = 0; seg < SEGS; seg++) {
      const i0 = ring * SEGS + seg;
      const i1 = ring * SEGS + ((seg + 1) % SEGS);
      const i2 = (ring + 1) * SEGS + seg;
      const i3 = (ring + 1) * SEGS + ((seg + 1) % SEGS);
      indices[ii++] = i0;
      indices[ii++] = i1;
      indices[ii++] = i2;
      indices[ii++] = i1;
      indices[ii++] = i3;
      indices[ii++] = i2;
    }
  }

  // Wireframe: circumferential + radial + diagonal (triangulated).
  const lineCount =
    (RINGS + 1) * SEGS * 2 + RINGS * SEGS * 2 + RINGS * SEGS * 2;
  const lineIndices = new Uint32Array(lineCount);
  let li = 0;
  for (let ring = 0; ring <= RINGS; ring++) {
    for (let seg = 0; seg < SEGS; seg++) {
      const i0 = ring * SEGS + seg;
      const i1 = ring * SEGS + ((seg + 1) % SEGS);
      lineIndices[li++] = i0;
      lineIndices[li++] = i1;
    }
  }
  for (let ring = 0; ring < RINGS; ring++) {
    for (let seg = 0; seg < SEGS; seg++) {
      const i0 = ring * SEGS + seg;
      const i2 = (ring + 1) * SEGS + seg;
      lineIndices[li++] = i0;
      lineIndices[li++] = i2;
    }
  }
  for (let ring = 0; ring < RINGS; ring++) {
    for (let seg = 0; seg < SEGS; seg++) {
      const i0 = ring * SEGS + seg;
      const i3 = (ring + 1) * SEGS + ((seg + 1) % SEGS);
      lineIndices[li++] = i0;
      lineIndices[li++] = i3;
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

  const lineVao = gl.createVertexArray()!;
  gl.bindVertexArray(lineVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const lineIbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIbo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lineIndices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  const uMVP = gl.getUniformLocation(prog, "uMVP");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uBass = gl.getUniformLocation(prog, "uBass");
  const uBands = gl.getUniformLocation(prog, "uBands[0]");
  const uMusic = gl.getUniformLocation(prog, "uMusic");
  const uSnare = gl.getUniformLocation(prog, "uSnare");
  const uWire = gl.getUniformLocation(prog, "uWire");

  const mvp = new Float32Array(16);
  const proj = new Float32Array(16);
  const view = new Float32Array(16);
  const rawBands = new Float32Array(64);
  const bands = new Float32Array(64);
  const blurTmp = new Float32Array(64);
  let snare = 0;
  let snareEnv = 0;

  let dragging = false;
  let yaw = 0.35;
  let pitch = 0.42; // elevation radians; 0 = horizon, +π/2 = top, −π/2 = underside
  let zoom = 1.05; // 1 = default distance; lower = closer
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
    yaw += dx * 0.005;
    // Full vertical orbit (~180°): underside ↔ top, stop just shy of poles.
    const lim = Math.PI * 0.5 - 0.04;
    pitch = Math.max(-lim, Math.min(lim, pitch + dy * 0.005));
  };
  const onUp = () => {
    dragging = false;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY) * Math.min(1.2, Math.abs(e.deltaY) / 120);
    zoom = Math.max(0.45, Math.min(2.2, zoom + delta * 0.12));
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.depthFunc(gl.LEQUAL);

  return {
    update(dt: number) {
      time += dt;
      syncPlayingUi();

      audio.getSpectrum(rawBands);
      const bass = audio.getBass();
      const music = songOn ? 1 : 0;

      // Snappier music tracking — still damped, but hits show up.
      for (let i = 0; i < 64; i++) {
        const t = Math.min(1, rawBands[i] * 1.2);
        const rising = t > bands[i];
        const a = rising ? 0.4 : 0.08;
        bands[i] += (t - bands[i]) * a;
      }
      for (let i = 0; i < 64; i++) {
        const l = bands[Math.max(0, i - 1)];
        const c = bands[i];
        const r = bands[Math.min(63, i + 1)];
        blurTmp[i] = l * 0.1 + c * 0.8 + r * 0.1;
      }
      bands.set(blurTmp);

      // Snare: stricter gate so only real cracks flash (not constant bleach).
      let snareSum = 0;
      for (let i = 14; i <= 36; i++) snareSum += rawBands[i];
      snareSum /= 23;
      let kickSum = 0;
      for (let i = 0; i <= 6; i++) kickSum += rawBands[i];
      kickSum /= 7;
      const snareRaw = Math.max(0, snareSum - kickSum * 0.8);
      const attack = Math.max(0, snareRaw - snareEnv);
      snareEnv = snareEnv * 0.86 + snareRaw * 0.14;
      const snareHit = Math.min(1, attack * 10.0 + Math.max(0, snareRaw - 0.2) * 1.3);
      snare += (snareHit > snare ? 0.85 : 0.14) * (snareHit - snare);

      const aspect = w / Math.max(1, h);
      perspective(proj, (55 * Math.PI) / 180, aspect, 0.15, 80);

      // Spherical orbit: yaw full 360°, pitch ±90° around the disc centre.
      const dist = 16.0 * zoom;
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const eyeX = Math.sin(yaw) * dist * cp;
      const eyeY = dist * sp + bass * music * 0.08;
      const eyeZ = Math.cos(yaw) * dist * cp;
      const lookY = bass * music * 0.04;
      // Flip up when under the disc so lookAt doesn't gimbal-lock.
      const upY = sp > -0.99 ? 1 : -1;

      lookAt(view, [eyeX, eyeY, eyeZ], [0, lookY, 0], [0, upY, 0]);
      mul(mvp, proj, view);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.01, 0.01, 0.02, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.useProgram(prog);
      gl.uniformMatrix4fv(uMVP, false, mvp);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uBass, bass);
      gl.uniform1fv(uBands, bands);
      gl.uniform1f(uMusic, music);
      gl.uniform1f(uSnare, snare * music);

      // Subtle fill for depth
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(uWire, 0);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0);
      gl.disable(gl.POLYGON_OFFSET_FILL);

      // Triangulated neon wires (additive)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.uniform1f(uWire, 1);
      gl.depthMask(false);
      gl.bindVertexArray(lineVao);
      gl.drawElements(gl.LINES, lineIndices.length, gl.UNSIGNED_INT, 0);
      gl.depthMask(true);
      gl.bindVertexArray(null);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    destroy() {
      if (debounceTimer) clearTimeout(debounceTimer);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      if (shared.isSongPlaying()) shared.stopSong();
      else audio.stopBed();
      void shared.unlockAndStartPeace();
      hud.destroy();
      gl.deleteBuffer(vbo);
      gl.deleteBuffer(ibo);
      gl.deleteBuffer(lineIbo);
      gl.deleteVertexArray(vao);
      gl.deleteVertexArray(lineVao);
      gl.deleteProgram(prog);
    },
  };
}

export const meshLattice: WebGLExperienceModule = {
  id: "mesh-lattice",
  kind: "webgl",
  name: "Mesh Lattice",
  modality: "WebGL",
  tagline: "Orbit the lattice. Search a song and watch it dance.",
  hint: "Drag to orbit, scroll to zoom. Search or play Demo to drive the mesh.",
  accent: "#6db8b0",
  badge: "WebGL",
  mount,
};
