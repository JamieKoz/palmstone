import type { AudioBus } from "./types";
import { getMuted } from "./storage";

type BedStyle = "lattice" | "aurora" | "peace" | "song";

export type SharedAudio = AudioBus & {
  unlockAndStartPeace: () => Promise<void>;
  uiSoft: (variant?: 0 | 1) => void;
  setPeaceEnabled: (on: boolean) => void;
  startSong: () => void;
  stopSong: () => void;
  isSongPlaying: () => boolean;
  bongo: (freq: number, intensity?: number) => void;
};

let shared: SharedAudio | null = null;

const MASTER_GAIN = 0.72;
const PEACE_BED_GAIN = 0.9;

/**
 * Shared Web Audio for the whole app.
 * Ambient / song / UI SFX are original procedural synthesis — not third-party assets.
 */
export function getSharedAudio(): SharedAudio {
  if (shared) return shared;

  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = typeof window !== "undefined" ? getMuted() : false;
  let lastGrain = 0;
  let lastClick = 0;
  let lastWhoosh = 0;
  let lastUi = 0;
  let lastBongo = 0;
  let analyser: AnalyserNode | null = null;
  let freqData: Uint8Array<ArrayBuffer> | null = null;
  let bedNodes: AudioNode[] = [];
  let bedOscs: OscillatorNode[] = [];
  let bedGain: GainNode | null = null;
  let bedStyle: BedStyle | null = null;
  let peaceWanted = true;
  let experienceBedActive = false;
  let songPlaying = false;
  let bassSmooth = 0;
  let arpeggioTimer: number | null = null;
  let songTimer: number | null = null;
  let songStep = 0;
  let uiFlip = 0;

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
      master.gain.value = muted ? 0 : MASTER_GAIN;
      master.connect(ctx.destination);
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

  function out() {
    ensure();
    return master;
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

  function startPeaceBed() {
    const c = ensure();
    const m = out();
    if (!c || !m) return;
    if (bedStyle === "peace" && bedGain) return;
    stopBedInternal();
    bedStyle = "peace";
    bedGain = c.createGain();
    bedGain.gain.value = PEACE_BED_GAIN;
    bedGain.connect(m);
    if (analyser) bedGain.connect(analyser);

    // Louder, warmer drones so ambient is clearly audible after unlock.
    const drones: { f: number; g: number; type: OscillatorType }[] = [
      { f: 73.42, g: 0.42, type: "sine" },
      { f: 110, g: 0.34, type: "sine" },
      { f: 146.83, g: 0.28, type: "triangle" },
      { f: 220, g: 0.2, type: "sine" },
      { f: 329.63, g: 0.1, type: "sine" },
    ];
    for (const d of drones) {
      const osc = c.createOscillator();
      osc.type = d.type;
      osc.frequency.value = d.f;
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.05 + Math.random() * 0.04;
      const lfoG = c.createGain();
      lfoG.gain.value = d.f * 0.004;
      lfo.connect(lfoG);
      lfoG.connect(osc.frequency);
      const g = c.createGain();
      g.gain.value = d.g;
      const filt = c.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 1200;
      osc.connect(g);
      g.connect(filt);
      filt.connect(bedGain);
      osc.start();
      lfo.start();
      bedOscs.push(osc, lfo);
      bedNodes.push(g, filt, lfoG);
    }

    const dur = 3;
    const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const ng = c.createGain();
    ng.gain.value = 0.08;
    const nf = c.createBiquadFilter();
    nf.type = "lowpass";
    nf.frequency.value = 420;
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(bedGain);
    noise.start();
    bedOscs.push(noise as unknown as OscillatorNode);
    bedNodes.push(ng, nf);

    const scale = [146.83, 174.61, 220, 261.63, 293.66, 349.23];
    arpeggioTimer = window.setInterval(() => {
      if (muted || bedStyle !== "peace" || !bedGain) return;
      const t = now();
      const start = Math.floor(Math.random() * 3);
      for (let i = 0; i < 4; i++) softChime(scale[start + i], t + i * 0.2, 1.5, 0.14);
    }, 5200);
  }

  function startVisualBed(style: "lattice" | "aurora") {
    const c = ensure();
    const m = out();
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
    const m = out();
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
    if (peaceWanted && !experienceBedActive && !songPlaying) startPeaceBed();
  }

  function uiSoft(variant?: 0 | 1) {
    if (muted) return;
    const c = ensure();
    const m = out();
    if (!c || !m) return;
    const t = now();
    if (t - lastUi < 0.04) return;
    lastUi = t;
    const v = variant ?? ((uiFlip++ % 2) as 0 | 1);
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
      if (master) master.gain.value = muted ? 0 : MASTER_GAIN;
    },
    isMuted() {
      return muted;
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
    startBed(style = "lattice") {
      ensure();
      if (style === "peace") {
        peaceWanted = true;
        if (!experienceBedActive && !songPlaying) startPeaceBed();
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
      if (bedStyle === "lattice" || bedStyle === "aurora") {
        stopBedInternal();
        restorePeaceIfWanted();
      }
    },
    async unlockAndStartPeace() {
      await resumeCtx();
      peaceWanted = true;
      if (!experienceBedActive && !songPlaying) startPeaceBed();
    },
    uiSoft,
    setPeaceEnabled(on: boolean) {
      peaceWanted = on;
      if (!on && bedStyle === "peace") stopBedInternal();
      else if (on && !experienceBedActive && !songPlaying) startPeaceBed();
    },
  };

  return shared;
}

export function createAudioBus(initialMuted = false): AudioBus {
  const bus = getSharedAudio();
  bus.setMuted(initialMuted);
  return bus;
}
