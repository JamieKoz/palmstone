import type { AudioBus } from "./types";
import { getMuted } from "./storage";

type BedStyle = "lattice" | "aurora" | "peace";

export type SharedAudio = AudioBus & {
  unlockAndStartPeace: () => Promise<void>;
  uiSoft: (variant?: 0 | 1) => void;
  setPeaceEnabled: (on: boolean) => void;
};

let shared: SharedAudio | null = null;

/**
 * Shared Web Audio for the whole app.
 * Peaceful perpetual ambient is original procedural synthesis inspired by the
 * soft looping beds on sites like leoparpeix.com — we do not copy their AAC assets.
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
  let analyser: AnalyserNode | null = null;
  let freqData: Uint8Array<ArrayBuffer> | null = null;
  let bedNodes: AudioNode[] = [];
  let bedOscs: OscillatorNode[] = [];
  let bedGain: GainNode | null = null;
  let bedStyle: BedStyle | null = null;
  let peaceWanted = true;
  let experienceBedActive = false;
  let bassSmooth = 0;
  let arpeggioTimer: number | null = null;
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
      master.gain.value = muted ? 0 : 0.38;
      master.connect(ctx.destination);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
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

  function clearArpeggio() {
    if (arpeggioTimer != null) {
      window.clearInterval(arpeggioTimer);
      arpeggioTimer = null;
    }
  }

  function stopBedInternal() {
    clearArpeggio();
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
    if (!c || !bedGain || muted) return;
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gainAmt, when + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1600;
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
    bedGain.gain.value = 0.32;
    bedGain.connect(m);
    if (analyser) bedGain.connect(analyser);

    const drones: { f: number; g: number; type: OscillatorType }[] = [
      { f: 73.42, g: 0.14, type: "sine" },
      { f: 110, g: 0.1, type: "sine" },
      { f: 146.83, g: 0.08, type: "triangle" },
      { f: 220, g: 0.05, type: "sine" },
    ];
    for (const d of drones) {
      const osc = c.createOscillator();
      osc.type = d.type;
      osc.frequency.value = d.f;
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.04 + Math.random() * 0.03;
      const lfoG = c.createGain();
      lfoG.gain.value = d.f * 0.003;
      lfo.connect(lfoG);
      lfoG.connect(osc.frequency);
      const g = c.createGain();
      g.gain.value = d.g;
      const filt = c.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 900;
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
    ng.gain.value = 0.028;
    const nf = c.createBiquadFilter();
    nf.type = "lowpass";
    nf.frequency.value = 380;
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
      for (let i = 0; i < 3; i++) softChime(scale[start + i], t + i * 0.22, 1.45, 0.042);
    }, 7500);
  }

  function startVisualBed(style: "lattice" | "aurora") {
    const c = ensure();
    const m = out();
    if (!c || !m) return;
    if (bedStyle === style && bedGain) return;
    stopBedInternal();
    bedStyle = style;
    bedGain = c.createGain();
    bedGain.gain.value = style === "lattice" ? 0.2 : 0.16;
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
      g.gain.value = 0.12 / (1 + i * 0.35);
      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 600 + i * 180;
      osc.connect(g);
      g.connect(filter);
      filter.connect(bedGain!);
      osc.start();
      bedOscs.push(osc, lfo);
      bedNodes.push(g, filter, lfoGain);
    });

    const dur = 2;
    const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const ng = c.createGain();
    ng.gain.value = style === "lattice" ? 0.035 : 0.022;
    const nf = c.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = style === "lattice" ? 400 : 280;
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(bedGain);
    noise.start();
    bedOscs.push(noise as unknown as OscillatorNode);
    bedNodes.push(ng, nf);
  }

  function restorePeaceIfWanted() {
    if (peaceWanted && !experienceBedActive) startPeaceBed();
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
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200;

    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.04), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const noise = c.createBufferSource();
    noise.buffer = buf;
    const ng = c.createGain();
    ng.gain.value = 0.05;
    const nf = c.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = v === 0 ? 1800 : 2400;
    nf.Q.value = 1.2;

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

  shared = {
    async resume() {
      await resumeCtx();
    },
    setMuted(m: boolean) {
      muted = m;
      if (master) master.gain.value = muted ? 0 : 0.38;
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
      g.gain.value = 0.22 * intensity;
      const filter = c.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 800 + pitch * 1200;
      filter.Q.value = 0.8;
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
      g.gain.value = 0.18 * intensity;
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
      g.gain.exponentialRampToValueAtTime(0.2 * intensity, t + 0.004);
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
      g.gain.exponentialRampToValueAtTime(0.28 * intensity, t + 0.01);
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
      g.gain.exponentialRampToValueAtTime(0.15 * intensity, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(g);
      g.connect(m);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    },
    startBed(style = "lattice") {
      ensure();
      if (style === "peace") {
        peaceWanted = true;
        if (!experienceBedActive) startPeaceBed();
        return;
      }
      experienceBedActive = true;
      startVisualBed(style);
    },
    stopBed() {
      experienceBedActive = false;
      stopBedInternal();
      restorePeaceIfWanted();
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
      bassSmooth = bassSmooth * 0.85 + v * 0.15;
      return bassSmooth;
    },
    destroy() {
      experienceBedActive = false;
      if (bedStyle === "lattice" || bedStyle === "aurora") {
        stopBedInternal();
        restorePeaceIfWanted();
      }
    },
    async unlockAndStartPeace() {
      await resumeCtx();
      peaceWanted = true;
      if (!experienceBedActive) startPeaceBed();
    },
    uiSoft,
    setPeaceEnabled(on: boolean) {
      peaceWanted = on;
      if (!on && bedStyle === "peace") stopBedInternal();
      else if (on && !experienceBedActive) startPeaceBed();
    },
  };

  return shared;
}

export function createAudioBus(initialMuted = false): AudioBus {
  const bus = getSharedAudio();
  bus.setMuted(initialMuted);
  return bus;
}
