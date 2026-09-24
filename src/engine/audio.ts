import type { AudioBus } from "./types";
import { getMuted, getMusicMuted } from "./storage";

type BedStyle = "lattice" | "aurora" | "peace" | "song";

export type SharedAudio = AudioBus & {
  unlockAndStartPeace: () => Promise<void>;
  uiSoft: (variant?: 0 | 1) => void;
  setPeaceEnabled: (on: boolean) => void;
  setMusicMuted: (muted: boolean) => void;
  isMusicMuted: () => boolean;
  startSong: () => void;
  stopSong: () => void;
  isSongPlaying: () => boolean;
  bongo: (freq: number, intensity?: number) => void;
  thock: (intensity?: number, pitch?: number) => void;
  pop: (intensity?: number, pitch?: number) => void;
  penClick: (phase: "down" | "up", intensity?: number) => void;
  switchClick: (on: boolean, intensity?: number) => void;
  zip: (intensity?: number, pitch?: number, direction?: "open" | "close") => void;
  stopZip: () => void;
  elastic: (intensity?: number, pitch?: number) => void;
  elasticRelease: (intensity?: number, pitch?: number) => void;
  buttonPress: (phase?: "down" | "up", intensity?: number) => void;
  mouseClick: (intensity?: number, pitch?: number) => void;
  lampToggle: (on: boolean, intensity?: number) => void;
  water: (intensity?: number) => void;
};

let shared: SharedAudio | null = null;

const MASTER_GAIN = 0.72;
/** Ambient music sits under UI / experience SFX. */
const PEACE_BED_GAIN = 0.45;

/**
 * Shared Web Audio for the whole app.
 * Background bed: Reflection on Still Water (looped).
 * Experience SFX: recorded samples where available, procedural otherwise.
 */
export function getSharedAudio(): SharedAudio {
  if (shared) return shared;

  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let sfxGain: GainNode | null = null;
  let musicGain: GainNode | null = null;
  let muted = typeof window !== "undefined" ? getMuted() : false;
  let musicMuted = typeof window !== "undefined" ? getMusicMuted() : false;
  let lastGrain = 0;
  let lastClick = 0;
  let lastWhoosh = 0;
  let lastUi = 0;
  let lastBongo = 0;
  let lastThock = 0;
  let lastPop = 0;
  let lastZip = 0;
  let lastElastic = 0;
  let lastWater = 0;
  let analyser: AnalyserNode | null = null;
  let freqData: Uint8Array<ArrayBuffer> | null = null;
  let bedNodes: AudioNode[] = [];
  let bedOscs: OscillatorNode[] = [];
  let bedGain: GainNode | null = null;
  let bedStyle: BedStyle | null = null;
  let peaceWanted = typeof window !== "undefined" ? !getMusicMuted() : true;
  let experienceBedActive = false;
  let songPlaying = false;
  let bassSmooth = 0;
  let arpeggioTimer: number | null = null;
  let songTimer: number | null = null;
  let songStep = 0;
  let uiFlip = 0;
  let peaceBuffer: AudioBuffer | null = null;
  let peaceLoad: Promise<AudioBuffer | null> | null = null;

  type SampleId =
    | "bubblePop"
    | "keyboard"
    | "penDown"
    | "penUp"
    | "lightSwitch"
    | "zipOpen"
    | "zipClose"
    | "zipClose2"
    | "zipLoop"
    | "bigButtonDown"
    | "bigButtonRelease"
    | "mouseClick"
    | "elasticStretch"
    | "elasticRelease"
    | "lampSwitch"
    | "lampPullOff"
    | "water";

  const SAMPLE_FILES: Record<SampleId, string> = {
    bubblePop: "bubble-wrap-pop.mp3",
    keyboard: "keyboard-click.mp3",
    penDown: "pen-down-click.wav",
    penUp: "pen-release.wav",
    lightSwitch: "light-switch.mp3",
    zipOpen: "zipper-open.wav",
    zipClose: "zipper-close.wav",
    zipClose2: "zipper-close-2.wav",
    zipLoop: "zipper.mp3",
    bigButtonDown: "big-button-press-down.wav",
    bigButtonRelease: "big-button-press-release.wav",
    mouseClick: "mouse-click.mp3",
    elasticStretch: "elastic-stretch.mp3",
    elasticRelease: "elastic-release.mp3",
    lampSwitch: "lamp-switch.mp3",
    lampPullOff: "lamp-pull-off.mp3",
    water: "water-sound.mp3",
  };

  const sampleBuffers = new Map<SampleId, AudioBuffer>();
  let samplesLoad: Promise<void> | null = null;
  let zipLoopSrc: AudioBufferSourceNode | null = null;
  let zipLoopGain: GainNode | null = null;
  let zipLoopDir: "open" | "close" | null = null;
  let zipLoopBufId: SampleId | null = null;

  function assetUrl(path: string) {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    return `${base}${path}`;
  }

  function peaceTrackUrl() {
    return assetUrl("/audio/reflection-on-still-water.mp3");
  }

  async function ensureSamples() {
    if (sampleBuffers.size === Object.keys(SAMPLE_FILES).length) return;
    if (samplesLoad) return samplesLoad;
    samplesLoad = (async () => {
      const c = ensure();
      if (!c) return;
      await Promise.all(
        (Object.entries(SAMPLE_FILES) as [SampleId, string][]).map(async ([id, file]) => {
          if (sampleBuffers.has(id)) return;
          try {
            const res = await fetch(assetUrl(`/audio/sfx/${file}`));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.arrayBuffer();
            sampleBuffers.set(id, await c.decodeAudioData(data.slice(0)));
          } catch (err) {
            console.warn(`Failed to load SFX ${file}`, err);
          }
        }),
      );
    })();
    return samplesLoad;
  }

  /** Play a one-shot sample. Returns false if unavailable (caller may fallback). */
  function playSample(
    id: SampleId,
    opts: { gain?: number; rate?: number; duration?: number; offset?: number } = {},
  ): boolean {
    if (muted) return true; // swallow — don't procedural-fallback while muted
    const c = ensure();
    const m = out();
    const buf = sampleBuffers.get(id);
    if (!c || !m || !buf) return false;
    const t = now();
    const src = c.createBufferSource();
    src.buffer = buf;
    const rate = Math.max(0.5, Math.min(2, opts.rate ?? 1));
    src.playbackRate.value = rate;
    const g = c.createGain();
    const gainAmt = Math.max(0.0001, opts.gain ?? 0.85);
    const offset = Math.max(0, Math.min(buf.duration * 0.95, opts.offset ?? 0));
    g.gain.setValueAtTime(gainAmt, t);
    if (opts.duration != null && opts.duration > 0) {
      const dur = opts.duration;
      g.gain.setValueAtTime(gainAmt, t);
      g.gain.setValueAtTime(gainAmt, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.start(t, offset, dur + 0.03);
      src.stop(t + dur + 0.04);
    } else {
      const remain = (buf.duration - offset) / rate;
      src.start(t, offset);
      src.stop(t + remain + 0.02);
    }
    src.connect(g);
    g.connect(m);
    return true;
  }

  async function loadPeaceTrack(): Promise<AudioBuffer | null> {
    if (peaceBuffer) return peaceBuffer;
    if (peaceLoad) return peaceLoad;
    peaceLoad = (async () => {
      const c = ensure();
      if (!c) return null;
      try {
        const res = await fetch(peaceTrackUrl());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        peaceBuffer = await c.decodeAudioData(data.slice(0));
        return peaceBuffer;
      } catch (err) {
        console.error("Failed to load ambient track", err);
        peaceLoad = null;
        return null;
      }
    })();
    return peaceLoad;
  }

  function ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(ctx.destination);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = muted ? 0 : 1;
      sfxGain.connect(master);

      musicGain = ctx.createGain();
      musicGain.gain.value = musicMuted ? 0 : 1;
      musicGain.connect(master);

      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      freqData = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    }
    return ctx;
  }

  async function resumeCtx() {
    const c = ensure();
    if (c && c.state === "suspended") await c.resume();
  }

  function now() {
    return ensure()?.currentTime ?? 0;
  }

  /** SFX bus — experience / UI sounds. */
  function out() {
    ensure();
    return sfxGain;
  }

  /** Music / ambient bed bus. */
  function musicOut() {
    ensure();
    return musicGain;
  }

  function clearTimers() {
    if (arpeggioTimer != null) {
      window.clearInterval(arpeggioTimer);
      arpeggioTimer = null;
    }
    if (songTimer != null) {
      window.clearInterval(songTimer);
      songTimer = null;
    }
  }

  function stopBedInternal() {
    clearTimers();
    songPlaying = false;
    for (const osc of bedOscs) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        /* */
      }
    }
    for (const n of bedNodes) {
      try {
        n.disconnect();
      } catch {
        /* */
      }
    }
    bedOscs = [];
    bedNodes = [];
    bedGain = null;
    bedStyle = null;
  }

  function softChime(freq: number, when: number, dur: number, gainAmt: number) {
    const c = ensure();
    if (!c || !bedGain) return;
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gainAmt, when + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 2200;
    osc.connect(g);
    g.connect(f);
    f.connect(bedGain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  async function startPeaceBed() {
    const c = ensure();
    if (!c || !musicOut()) return;
    if (bedStyle === "peace" && bedGain) return;

    const buf = await loadPeaceTrack();
    if (!buf) return;
    // Re-check after decode — song / experience bed may have taken over.
    if (!peaceWanted || experienceBedActive || songPlaying || musicMuted) return;
    if (bedStyle === "peace" && bedGain) return;

    stopBedInternal();
    bedStyle = "peace";
    bedGain = c.createGain();
    bedGain.gain.value = PEACE_BED_GAIN;
    const dest = musicOut();
    if (!dest) return;
    bedGain.connect(dest);
    if (analyser) bedGain.connect(analyser);

    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(bedGain);
    src.start();
    bedOscs.push(src as unknown as OscillatorNode);
  }

  function startVisualBed(style: "lattice" | "aurora") {
    const c = ensure();
    const m = master;
    if (!c || !m) return;
    if (bedStyle === style && bedGain) return;
    stopBedInternal();
    bedStyle = style;
    bedGain = c.createGain();
    bedGain.gain.value = style === "lattice" ? 0.55 : 0.45;
    bedGain.connect(m);
    if (analyser) bedGain.connect(analyser);

    const freqs =
      style === "lattice"
        ? [55, 82.5, 110, 165, 220, 330]
        : [49, 73.5, 98, 147, 196, 294];
    freqs.forEach((f, i) => {
      const osc = c.createOscillator();
      osc.type = i % 2 === 0 ? "sine" : "triangle";
      osc.frequency.value = f;
      const lfo = c.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.05 + i * 0.017;
      const lfoGain = c.createGain();
      lfoGain.gain.value = f * 0.004;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();
      const g = c.createGain();
      g.gain.value = 0.22 / (1 + i * 0.28);
      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 700 + i * 180;
      osc.connect(g);
      g.connect(filter);
      filter.connect(bedGain!);
      osc.start();
      bedOscs.push(osc, lfo);
      bedNodes.push(g, filter, lfoGain);
    });
  }

  function songKick(when: number) {
    const c = ensure();
    if (!c || !bedGain) return;
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(110, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.18);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.55, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.28);
    osc.connect(g);
    g.connect(bedGain);
    osc.start(when);
    osc.stop(when + 0.3);
  }

  function songHat(when: number) {
    const c = ensure();
    if (!c || !bedGain) return;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.05), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 6000;
    const g = c.createGain();
    g.gain.setValueAtTime(0.12, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    src.connect(f);
    f.connect(g);
    g.connect(bedGain);
    src.start(when);
    src.stop(when + 0.06);
  }

  function songNote(freq: number, when: number, dur: number) {
    softChime(freq, when, dur, 0.18);
  }

  function startSongBed() {
    const c = ensure();
    const m = master;
    if (!c || !m) return;
    stopBedInternal();
    bedStyle = "song";
    songPlaying = true;
    experienceBedActive = true;
    bedGain = c.createGain();
    bedGain.gain.value = 0.85;
    bedGain.connect(m);
    if (analyser) bedGain.connect(analyser);

    // Soft pad under the song
    for (const f of [65.41, 98, 130.81]) {
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = c.createGain();
      g.gain.value = 0.18;
      osc.connect(g);
      g.connect(bedGain);
      osc.start();
      bedOscs.push(osc);
      bedNodes.push(g);
    }

    const melody = [196, 220, 247, 262, 294, 330, 294, 262];
    songStep = 0;
    songTimer = window.setInterval(() => {
      if (!songPlaying || !bedGain || muted) return;
      const t = now();
      // 4/4: kick on 0,2 — hat on offs — melody every step
      if (songStep % 4 === 0 || songStep % 4 === 2) songKick(t);
      if (songStep % 2 === 1) songHat(t);
      songNote(melody[songStep % melody.length], t, 0.35);
      if (songStep % 8 === 4) songNote(melody[(songStep + 3) % melody.length] * 0.5, t, 0.5);
      songStep++;
    }, 280);
  }

  function restorePeaceIfWanted() {
    if (peaceWanted && !musicMuted && !experienceBedActive && !songPlaying) void startPeaceBed();
  }

  function uiSoft(variant?: 0 | 1) {
    if (muted) return;
    const t = now();
    if (t - lastUi < 0.04) return;
    lastUi = t;
    void ensureSamples();
    const v = variant ?? ((uiFlip++ % 2) as 0 | 1);
    // App-wide nav / UI — soft bubble pop
    if (
      playSample("bubblePop", {
        gain: 0.58,
        rate: 0.94 + v * 0.08 + Math.random() * 0.05,
      })
    ) {
      return;
    }
    const c = ensure();
    const m = out();
    if (!c || !m) return;
    const base = v === 0 ? 640 : 780;

    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 0.72, t + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;

    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.04), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const noise = c.createBufferSource();
    noise.buffer = buf;
    const ng = c.createGain();
    ng.gain.value = 0.07;
    const nf = c.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = v === 0 ? 1800 : 2400;

    osc.connect(g);
    g.connect(lp);
    lp.connect(m);
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(m);
    osc.start(t);
    osc.stop(t + 0.16);
    noise.start(t);
    noise.stop(t + 0.05);
  }

  function thock(intensity = 0.6, pitch = 1) {
    if (muted) return;
    const t = now();
    if (t - lastThock < 0.018) return;
    lastThock = t;
    void ensureSamples();
    // Sample has ~60ms lead-in silence then a double click — slice the meat
    if (
      playSample("keyboard", {
        gain: 1.05 * intensity,
        rate: 0.78 + pitch * 0.18,
        offset: 0.05,
        duration: 0.24,
      })
    ) {
      return;
    }
    const c = ensure();
    const m = out();
    if (!c || !m) return;

    // Soft body thud (fallback)
    const osc = c.createOscillator();
    osc.type = "sine";
    const f0 = 95 * pitch;
    osc.frequency.setValueAtTime(f0 * 1.55, t);
    osc.frequency.exponentialRampToValueAtTime(f0, t + 0.05);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42 * intensity, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(g);
    g.connect(m);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  function pop(intensity = 0.7, pitch = 1) {
    if (muted) return;
    const t = now();
    if (t - lastPop < 0.01) return;
    lastPop = t;
    void ensureSamples();
    if (
      playSample("bubblePop", {
        gain: 0.9 * intensity,
        rate: 0.82 + pitch * 0.28,
      })
    ) {
      return;
    }
    const c = ensure();
    const m = out();
    if (!c || !m) return;
    const osc = c.createOscillator();
    osc.type = "sine";
    const f0 = 420 * pitch;
    osc.frequency.setValueAtTime(f0 * 2.8, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.09);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55 * intensity, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(g);
    g.connect(m);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  function penClick(phase: "down" | "up", intensity = 0.75) {
    if (muted) return;
    void ensureSamples();
    const id = phase === "down" ? "penDown" : "penUp";
    if (playSample(id, { gain: 0.95 * intensity, rate: 0.96 + Math.random() * 0.08 })) {
      return;
    }
    // Minimal fallback tick
    const c = ensure();
    const m = out();
    if (!c || !m) return;
    const t = now();
    const osc = c.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(phase === "down" ? 1800 : 900, t);
    osc.frequency.exponentialRampToValueAtTime(phase === "down" ? 700 : 280, t + 0.04);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35 * intensity, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(g);
    g.connect(m);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  function switchClick(on: boolean, intensity = 0.85) {
    if (muted) return;
    void ensureSamples();
    // Slight rate shift so on/off feel distinct
    if (
      playSample("lightSwitch", {
        gain: 0.9 * intensity,
        rate: on ? 1.05 : 0.92,
      })
    ) {
      return;
    }
    const c = ensure();
    const m = out();
    if (!c || !m) return;
    const t = now();

    const impact = c.createOscillator();
    impact.type = "triangle";
    const f0 = on ? 980 : 720;
    impact.frequency.setValueAtTime(f0 * 1.55, t);
    impact.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.035);
    const impactG = c.createGain();
    impactG.gain.setValueAtTime(0.0001, t);
    impactG.gain.exponentialRampToValueAtTime(0.42 * intensity, t + 0.001);
    impactG.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    impact.connect(impactG);
    impactG.connect(m);

    const body = c.createOscillator();
    body.type = "sine";
    body.frequency.setValueAtTime(on ? 190 : 140, t);
    body.frequency.exponentialRampToValueAtTime(on ? 95 : 70, t + 0.06);
    const bodyG = c.createGain();
    bodyG.gain.setValueAtTime(0.0001, t);
    bodyG.gain.exponentialRampToValueAtTime(0.5 * intensity, t + 0.002);
    bodyG.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    body.connect(bodyG);
    bodyG.connect(m);

    impact.start(t);
    impact.stop(t + 0.06);
    body.start(t);
    body.stop(t + 0.1);
  }

  function stopZipInternal() {
    if (zipLoopGain) {
      const t = now();
      try {
        zipLoopGain.gain.cancelScheduledValues(t);
        zipLoopGain.gain.setValueAtTime(Math.max(0.0001, zipLoopGain.gain.value), t);
        zipLoopGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      } catch {
        /* */
      }
    }
    const src = zipLoopSrc;
    zipLoopSrc = null;
    zipLoopGain = null;
    zipLoopDir = null;
    zipLoopBufId = null;
    if (src) {
      window.setTimeout(() => {
        try {
          src.stop();
          src.disconnect();
        } catch {
          /* */
        }
      }, 100);
    }
  }

  /** Short zipper tooth tick — one bump, pitch tracks pull speed. */
  function zip(intensity = 0.55, pitch = 1, direction: "open" | "close" = "open") {
    if (muted) return;
    const c = ensure();
    const m = out();
    if (!c || !m) return;
    const t = now();
    // Allow denser teeth when zipping fast (pitch carries speed)
    if (t - lastZip < 0.012) return;
    lastZip = t;

    // Single metal/plastic tooth: deeper when slow, climbs high when fast
    const rate = Math.max(0.5, Math.min(2.6, pitch));
    const f0 = (direction === "open" ? 440 : 400) * rate;
    const tick = c.createOscillator();
    tick.type = "triangle";
    tick.frequency.setValueAtTime(f0 * 1.15, t);
    tick.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.018);
    const tickG = c.createGain();
    const gainAmt = 0.12 + intensity * 0.22;
    tickG.gain.setValueAtTime(0.0001, t);
    tickG.gain.exponentialRampToValueAtTime(gainAmt, t + 0.001);
    tickG.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900 * rate;
    bp.Q.value = 1.8;
    tick.connect(bp);
    bp.connect(tickG);
    tickG.connect(m);
    tick.start(t);
    tick.stop(t + 0.032);

    // Tiny noise transient — the "bump" of a tooth engaging
    const nLen = Math.ceil(c.sampleRate * 0.018);
    const buf = c.createBuffer(1, nLen, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < nLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / nLen, 2.2);
    }
    const noise = c.createBufferSource();
    noise.buffer = buf;
    const nf = c.createBiquadFilter();
    nf.type = "highpass";
    nf.frequency.value = 1200 * rate;
    const ng = c.createGain();
    ng.gain.value = 0.1 + intensity * 0.18;
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(m);
    noise.start(t);
    noise.stop(t + 0.02);
  }

  function stopZip() {
    stopZipInternal();
  }

  /** Rubber-band stretch — rising scrape while tension builds. */
  function elastic(intensity = 0.5, pitch = 1) {
    if (muted) return;
    const t = now();
    if (t - lastElastic < 0.04) return;
    lastElastic = t;
    void ensureSamples();
    // Sample has ~130ms lead-in silence — skip it and play a stretch bite
    if (
      playSample("elasticStretch", {
        gain: 0.85 * intensity,
        rate: 0.75 + pitch * 0.35,
        offset: 0.14 + Math.random() * 0.35,
        duration: 0.22,
      })
    ) {
      return;
    }
    const c = ensure();
    const m = out();
    if (!c || !m) return;

    const f0 = 180 * pitch;
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * (1.15 + intensity * 0.35), t + 0.08);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14 * intensity, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(600 * pitch, t);
    bp.frequency.exponentialRampToValueAtTime(1400 * pitch, t + 0.09);
    bp.Q.value = 2.2;
    osc.connect(bp);
    bp.connect(g);
    g.connect(m);

    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.09), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = Math.pow(1 - i / data.length, 1.4);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = c.createBufferSource();
    noise.buffer = buf;
    const nf = c.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = 900 * pitch + intensity * 400;
    nf.Q.value = 1.1;
    const ng = c.createGain();
    ng.gain.value = 0.16 * intensity;
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(m);

    const body = c.createOscillator();
    body.type = "sine";
    body.frequency.setValueAtTime(90 * pitch, t);
    body.frequency.linearRampToValueAtTime(110 * pitch + intensity * 40, t + 0.1);
    const bodyG = c.createGain();
    bodyG.gain.setValueAtTime(0.0001, t);
    bodyG.gain.exponentialRampToValueAtTime(0.12 * intensity, t + 0.008);
    bodyG.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    body.connect(bodyG);
    bodyG.connect(m);

    osc.start(t);
    osc.stop(t + 0.12);
    noise.start(t);
    noise.stop(t + 0.1);
    body.start(t);
    body.stop(t + 0.13);
  }

  function elasticRelease(intensity = 0.7, pitch = 1) {
    if (muted) return;
    void ensureSamples();
    if (
      playSample("elasticRelease", {
        gain: 0.95 * intensity,
        rate: 0.9 + pitch * 0.2,
        offset: 0.12,
        duration: 0.45,
      })
    ) {
      return;
    }
    elastic(intensity * 0.9, pitch);
  }

  function lampToggle(on: boolean, intensity = 0.9) {
    if (muted) return;
    void ensureSamples();
    if (on) {
      // Match svarden: pull-off when turning the lamp on
      if (
        playSample("lampPullOff", {
          gain: 0.55 * intensity,
          rate: 1.4,
        })
      ) {
        return;
      }
    } else if (
      playSample("lampSwitch", {
        gain: 0.9 * intensity,
        rate: 1,
      })
    ) {
      return;
    }
    switchClick(on, intensity);
  }

  /** Soft water stir — short bite from the long water bed while dragging. */
  function water(intensity = 0.5) {
    if (muted) return;
    const t = now();
    if (t - lastWater < 0.07) return;
    lastWater = t;
    void ensureSamples();
    if (
      playSample("water", {
        gain: 0.28 + intensity * 0.45,
        rate: 0.92 + Math.random() * 0.16,
        offset: 0.14 + Math.random() * 6.5,
        duration: 0.2 + intensity * 0.12,
      })
    ) {
      return;
    }
    const c = ensure();
    const m = out();
    if (!c || !m) return;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.12), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.2);
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600 + intensity * 800;
    const g = c.createGain();
    g.gain.value = 0.18 * intensity;
    src.connect(filter);
    filter.connect(g);
    g.connect(m);
    src.start(t);
    src.stop(t + 0.13);
  }

  function buttonPress(phase: "down" | "up" = "down", intensity = 0.9) {
    if (muted) return;
    void ensureSamples();
    const id = phase === "down" ? "bigButtonDown" : "bigButtonRelease";
    const offset = phase === "down" ? 0.1 : 0.08;
    if (
      playSample(id, {
        gain: 0.95 * intensity,
        rate: 0.97 + Math.random() * 0.06,
        offset,
      })
    ) {
      return;
    }
    const c = ensure();
    const m = out();
    if (!c || !m) return;
    const t = now();
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(phase === "down" ? 95 : 140, t);
    osc.frequency.exponentialRampToValueAtTime(phase === "down" ? 48 : 70, t + 0.14);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4 * intensity, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g);
    g.connect(m);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  function mouseClick(intensity = 0.75, pitch = 1) {
    if (muted) return;
    void ensureSamples();
    if (
      playSample("mouseClick", {
        gain: 0.85 * intensity,
        rate: 0.88 + pitch * 0.22,
      })
    ) {
      return;
    }
    const c = ensure();
    const m = out();
    if (!c || !m) return;
    const t = now();
    if (t - lastClick < 0.03) return;
    lastClick = t;
    const osc = c.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 180 * pitch + intensity * 80;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25 * intensity, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(g);
    g.connect(m);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  function bongo(freq: number, intensity = 0.7) {
    if (muted) return;
    const c = ensure();
    const m = out();
    if (!c || !m) return;
    const t = now();
    if (t - lastBongo < 0.02) return;
    lastBongo = t;

    // Membrane body
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * 1.8, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55 * intensity, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    // Skin slap (noise)
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.06), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    }
    const noise = c.createBufferSource();
    noise.buffer = buf;
    const ng = c.createGain();
    ng.gain.value = 0.28 * intensity;
    const nf = c.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = freq * 3.2;
    nf.Q.value = 1.4;

    // Overtones
    const osc2 = c.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.value = freq * 2.15;
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.18 * intensity, t + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

    osc.connect(g);
    g.connect(m);
    osc2.connect(g2);
    g2.connect(m);
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(m);
    osc.start(t);
    osc.stop(t + 0.25);
    osc2.start(t);
    osc2.stop(t + 0.14);
    noise.start(t);
    noise.stop(t + 0.07);
  }

  shared = {
    async resume() {
      await resumeCtx();
    },
    setMuted(m: boolean) {
      muted = m;
      ensure();
      if (sfxGain) sfxGain.gain.value = muted ? 0 : 1;
    },
    isMuted() {
      return muted;
    },
    setMusicMuted(m: boolean) {
      musicMuted = m;
      peaceWanted = !m;
      ensure();
      if (musicGain) musicGain.gain.value = musicMuted ? 0 : 1;
      if (musicMuted) {
        if (bedStyle === "peace") stopBedInternal();
      } else if (!experienceBedActive && !songPlaying) {
        void startPeaceBed();
      }
    },
    isMusicMuted() {
      return musicMuted;
    },
    grain(intensity = 0.4, pitch = 1) {
      if (muted) return;
      const c = ensure();
      const m = out();
      if (!c || !m) return;
      const t = now();
      if (t - lastGrain < 0.018) return;
      lastGrain = t;
      const dur = 0.04 + intensity * 0.05;
      const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const env = 1 - i / data.length;
        data[i] = (Math.random() * 2 - 1) * env * env * intensity;
      }
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = 0.7 + pitch * 0.8;
      const g = c.createGain();
      g.gain.value = 0.28 * intensity;
      const filter = c.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 800 + pitch * 1200;
      src.connect(filter);
      filter.connect(g);
      g.connect(m);
      src.start(t);
      src.stop(t + dur);
    },
    whoosh(intensity = 0.4) {
      if (muted) return;
      const c = ensure();
      const m = out();
      if (!c || !m) return;
      const t = now();
      if (t - lastWhoosh < 0.05) return;
      lastWhoosh = t;
      const dur = 0.18 + intensity * 0.2;
      const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const env = Math.sin((Math.PI * i) / data.length);
        data[i] = (Math.random() * 2 - 1) * env * intensity * 0.5;
      }
      const src = c.createBufferSource();
      src.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(400 + intensity * 900, t);
      filter.frequency.exponentialRampToValueAtTime(120, t + dur);
      const g = c.createGain();
      g.gain.value = 0.22 * intensity;
      src.connect(filter);
      filter.connect(g);
      g.connect(m);
      src.start(t);
      src.stop(t + dur);
    },
    click(intensity = 0.35, pitch = 1) {
      if (muted) return;
      const c = ensure();
      const m = out();
      if (!c || !m) return;
      const t = now();
      if (t - lastClick < 0.03) return;
      lastClick = t;
      const osc = c.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 180 * pitch + intensity * 80;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25 * intensity, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      osc.connect(g);
      g.connect(m);
      osc.start(t);
      osc.stop(t + 0.07);
    },
    pulse(intensity = 0.4) {
      if (muted) return;
      const c = ensure();
      const m = out();
      if (!c || !m) return;
      const t = now();
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(90, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.15);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32 * intensity, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(g);
      g.connect(m);
      osc.start(t);
      osc.stop(t + 0.22);
    },
    tone(freq = 220, intensity = 0.3, duration = 0.25) {
      if (muted) return;
      const c = ensure();
      const m = out();
      if (!c || !m) return;
      const t = now();
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2 * intensity, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(g);
      g.connect(m);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    },
    bongo,
    thock,
    pop,
    penClick,
    switchClick,
    zip,
    stopZip,
    elastic,
    elasticRelease,
    buttonPress,
    mouseClick,
    lampToggle,
    water,
    startBed(style = "lattice") {
      ensure();
      if (style === "peace") {
        peaceWanted = !musicMuted;
        if (peaceWanted && !experienceBedActive && !songPlaying) void startPeaceBed();
        return;
      }
      experienceBedActive = true;
      startVisualBed(style);
    },
    stopBed() {
      experienceBedActive = false;
      if (bedStyle === "lattice" || bedStyle === "aurora") {
        stopBedInternal();
        restorePeaceIfWanted();
      }
    },
    startSong() {
      void resumeCtx().then(() => startSongBed());
    },
    stopSong() {
      songPlaying = false;
      experienceBedActive = false;
      stopBedInternal();
      restorePeaceIfWanted();
    },
    isSongPlaying() {
      return songPlaying;
    },
    getSpectrum(outArr: Float32Array) {
      ensure();
      if (!analyser || !freqData) {
        outArr.fill(0);
        return;
      }
      analyser.getByteFrequencyData(freqData);
      const n = outArr.length;
      const bins = freqData.length;
      for (let i = 0; i < n; i++) {
        const start = Math.floor((i / n) * bins);
        const end = Math.floor(((i + 1) / n) * bins);
        let sum = 0;
        const count = Math.max(1, end - start);
        for (let j = start; j < end; j++) sum += freqData[j];
        outArr[i] = sum / count / 255;
      }
    },
    getBass() {
      ensure();
      if (!analyser || !freqData) return 0;
      analyser.getByteFrequencyData(freqData);
      let sum = 0;
      const n = Math.min(6, freqData.length);
      for (let i = 0; i < n; i++) sum += freqData[i];
      const v = sum / n / 255;
      bassSmooth = bassSmooth * 0.8 + v * 0.2;
      return bassSmooth;
    },
    destroy() {
      if (songPlaying) return; // keep song if somehow destroyed mid-play
      experienceBedActive = false;
      stopZipInternal();
      if (bedStyle === "lattice" || bedStyle === "aurora") {
        stopBedInternal();
        restorePeaceIfWanted();
      }
    },
    async unlockAndStartPeace() {
      await resumeCtx();
      await ensureSamples();
      peaceWanted = !musicMuted;
      if (peaceWanted && !experienceBedActive && !songPlaying) await startPeaceBed();
    },
    uiSoft,
    setPeaceEnabled(on: boolean) {
      peaceWanted = on && !musicMuted;
      if (!on && bedStyle === "peace") stopBedInternal();
      else if (peaceWanted && !experienceBedActive && !songPlaying) void startPeaceBed();
    },
  };

  return shared;
}

export function createAudioBus(initialMuted = false): AudioBus {
  const bus = getSharedAudio();
  bus.setMuted(initialMuted);
  return bus;
}
