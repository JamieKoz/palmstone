import type { AudioBus } from "./types";

/**
 * Lightweight shared synth bus — procedural only, no samples.
 * Designed to enhance feel; mute-safe experiences must still read well silent.
 */
export function createAudioBus(initialMuted = false): AudioBus {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = initialMuted;
  let lastGrain = 0;
  let lastClick = 0;
  let lastWhoosh = 0;

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
      master.gain.value = muted ? 0 : 0.35;
      master.connect(ctx.destination);
    }
    return ctx;
  }

  async function resume() {
    const c = ensure();
    if (c && c.state === "suspended") await c.resume();
  }

  function now() {
    return ensure()?.currentTime ?? 0;
  }

  function out(): GainNode | null {
    ensure();
    return master;
  }

  return {
    async resume() {
      await resume();
    },
    setMuted(m: boolean) {
      muted = m;
      if (master) master.gain.value = muted ? 0 : 0.35;
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
    destroy() {
      void ctx?.close();
      ctx = null;
      master = null;
    },
  };
}
