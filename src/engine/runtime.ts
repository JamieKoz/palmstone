import { Application, Container } from "pixi.js";
import { createAudioBus, getSharedAudio } from "./audio";
import { createHapticsBus } from "./haptics";
import type { ExperienceHandle, ExperienceModule } from "./types";
import { getHapticsPref, getMuted } from "./storage";

export type EngineController = {
  setMuted(muted: boolean): void;
  setHaptics(enabled: boolean): void;
  destroy(): void;
};

function measureHost(host: HTMLElement) {
  const rect = host.getBoundingClientRect();
  return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
}

async function startPixi(
  host: HTMLElement,
  module: Extract<ExperienceModule, { kind?: "pixi" }>,
): Promise<EngineController> {
  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.touchAction = "none";
  host.appendChild(canvas);

  const app = new Application();
  await app.init({
    canvas,
    resizeTo: host,
    background: 0x0e1210,
    antialias: true,
    resolution: Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 2),
    autoDensity: true,
    preference: "webgl",
  });

  const root = new Container();
  app.stage.addChild(root);

  const audio = createAudioBus(getMuted());
  const haptics = createHapticsBus(getHapticsPref());
  const size = measureHost(host);

  const ctx = {
    app,
    root,
    width: size.width,
    height: size.height,
    audio,
    haptics,
    muted: () => audio.isMuted(),
    hapticsEnabled: () => haptics.isEnabled(),
    host,
  };

  const handle: ExperienceHandle = await module.mount(ctx);

  let last = performance.now();
  const ticker = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    handle.update?.(dt);
  };
  app.ticker.add(ticker);

  const onResize = () => {
    const s = measureHost(host);
    ctx.width = s.width;
    ctx.height = s.height;
    handle.resize?.(s.width, s.height);
  };
  window.addEventListener("resize", onResize);

  const unlock = () => {
    void getSharedAudio().unlockAndStartPeace();
  };
  host.addEventListener("pointerdown", unlock, { once: true });

  return {
    setMuted(muted: boolean) {
      audio.setMuted(muted);
    },
    setHaptics(enabled: boolean) {
      haptics.setEnabled(enabled);
    },
    destroy() {
      window.removeEventListener("resize", onResize);
      host.removeEventListener("pointerdown", unlock);
      app.ticker.remove(ticker);
      handle.destroy();
      audio.destroy();
      app.destroy(true);
      if (canvas.parentElement === host) host.removeChild(canvas);
    },
  };
}

async function startWebGL(
  host: HTMLElement,
  module: Extract<ExperienceModule, { kind: "webgl" }>,
): Promise<EngineController> {
  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.touchAction = "none";
  host.appendChild(canvas);

  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 2);
  const size = measureHost(host);
  canvas.width = Math.floor(size.width * dpr);
  canvas.height = Math.floor(size.height * dpr);

  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("WebGL2 not available");

  const audio = createAudioBus(getMuted());
  const haptics = createHapticsBus(getHapticsPref());

  const ctx = {
    canvas,
    gl,
    width: size.width,
    height: size.height,
    audio,
    haptics,
    muted: () => audio.isMuted(),
    hapticsEnabled: () => haptics.isEnabled(),
    host,
  };

  const handle: ExperienceHandle = await module.mount(ctx);

  let last = performance.now();
  let raf = 0;
  const frame = (t: number) => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    handle.update?.(dt);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const onResize = () => {
    const s = measureHost(host);
    const d = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(s.width * d);
    canvas.height = Math.floor(s.height * d);
    gl.viewport(0, 0, canvas.width, canvas.height);
    ctx.width = s.width;
    ctx.height = s.height;
    handle.resize?.(s.width, s.height);
  };
  window.addEventListener("resize", onResize);
  gl.viewport(0, 0, canvas.width, canvas.height);

  const unlock = () => {
    void getSharedAudio().unlockAndStartPeace();
  };
  host.addEventListener("pointerdown", unlock, { once: true });

  return {
    setMuted(muted: boolean) {
      audio.setMuted(muted);
    },
    setHaptics(enabled: boolean) {
      haptics.setEnabled(enabled);
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      host.removeEventListener("pointerdown", unlock);
      handle.destroy();
      audio.destroy();
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
      if (canvas.parentElement === host) host.removeChild(canvas);
    },
  };
}

export async function startExperience(
  host: HTMLElement,
  module: ExperienceModule,
): Promise<EngineController> {
  if (module.kind === "webgl") {
    return startWebGL(host, module);
  }
  return startPixi(host, module);
}
