import { Container, Graphics, Text } from "pixi.js";
import { createHud } from "@/engine/hud";
import type { ExperienceContext, ExperienceHandle, ExperienceModule } from "@/engine/types";

type Key = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  pitch: number;
  press: number;
  flash: number;
  hold: number;
  labelText?: Text;
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
};

type NoteBar = {
  index: number;
  height: number;
  life: number;
};

type Mote = {
  x: number;
  y: number;
  s: number;
  a: number;
  p: number;
  v: number;
};

const NEON = 0xd56bff;
const NEON_DEEP = 0x9b3dff;
const SPARK_HOT = 0xfff7ff;
const SPARK_LILAC = 0xd7b0ff;

const WORD_BANK = [
  "flame", "synth", "thock", "click", "quiet", "stone", "pulse", "drift", "glass", "ember",
  "river", "cedar", "maple", "amber", "cloud", "spark", "bloom", "shore", "velvet", "coral",
  "the", "and", "for", "you", "are", "with", "that", "this", "have", "from",
  "they", "been", "more", "when", "your", "what", "will", "just", "like", "into",
  "than", "them", "some", "very", "could", "there", "their", "about", "other", "make",
  "look", "sound", "know", "take", "come", "place", "where", "right", "again", "still",
  "every", "small", "after", "home", "line", "word", "keys", "soft", "palm", "wave",
];

function pickWord(prev?: string) {
  let word = WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)] ?? "thock";
  if (prev && WORD_BANK.length > 1) {
    let guard = 0;
    while (word === prev && guard < 8) {
      word = WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)] ?? word;
      guard++;
    }
  }
  return word;
}

function mount(ctx: ExperienceContext): ExperienceHandle {
  const { root, audio, haptics } = ctx;
  ctx.host.dataset.thockBuild = "3";
  let w = ctx.width;
  let h = ctx.height;

  const layer = new Container();
  root.addChild(layer);
  const g = new Graphics();
  layer.addChild(g);
  const labels = new Container();
  layer.addChild(labels);
  const barG = new Graphics();
  layer.addChild(barG);
  const glowG = new Graphics();
  glowG.blendMode = "add";
  layer.addChild(glowG);
  const prompt = new Container();
  const promptG = new Graphics();
  const promptLabels = new Container();
  prompt.addChild(promptG);
  prompt.addChild(promptLabels);
  layer.addChild(prompt);

  const sparks: Spark[] = [];
  const bars: NoteBar[] = [];
  const motes: Mote[] = [];
  let interactive = false;
  const queue: string[] = [];
  let typed = "";
  let swallowSpace = false;
  let miss = 0;
  let promptSig = "";
  let promptWidth = 0;
  let caretBox: { x: number; y: number; w: number; h: number } | null = null;
  let promptTime = 0;

  const keys: Key[] = [];
  const rows: { label: string; u: number }[][] = [
    [
      { label: "tab", u: 1.45 },
      ..."QWERTYUIOP".split("").map((label) => ({ label, u: 1 })),
      { label: "bksp", u: 1.7 },
    ],
    [
      { label: "caps", u: 1.7 },
      ..."ASDFGHJKL".split("").map((label) => ({ label, u: 1 })),
      { label: "enter", u: 1.85 },
    ],
    [
      { label: "shift", u: 2.2 },
      ..."ZXCVBNM".split("").map((label) => ({ label, u: 1 })),
      { label: "shift", u: 2.25 },
    ],
    [{ label: "", u: 6.4 }],
  ];

  function clearLabels() {
    for (const k of keys) {
      k.labelText?.destroy();
      k.labelText = undefined;
    }
    labels.removeChildren();
  }

  const turn = document.createElement("div");
  turn.className = "kb-turn";
  turn.hidden = true;
  turn.setAttribute("role", "status");
  turn.innerHTML =
    '<span class="kb-turn__phone" aria-hidden="true"></span><p>Sideways feels better — or just play</p><button type="button" class="kb-turn__dismiss">Got it</button>';
  ctx.host.appendChild(turn);
  let tipDismissed = false;
  try {
    tipDismissed = sessionStorage.getItem("palmstone:kbTip") === "1";
  } catch {
    /* private mode */
  }
  turn.querySelector(".kb-turn__dismiss")?.addEventListener("click", (e) => {
    e.stopPropagation();
    tipDismissed = true;
    turn.hidden = true;
    try {
      sessionStorage.setItem("palmstone:kbTip", "1");
    } catch {
      /* quota */
    }
  });

  const portraitQuery =
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 900px) and (orientation: portrait)")
      : null;

  function phonePortrait() {
    return portraitQuery?.matches ?? false;
  }

  /** The slice of the canvas that is actually on screen. iPhone rotation often leaves the layout viewport taller than the window you can see. */
  function visibleFrame() {
    const vv = window.visualViewport;
    const host = ctx.host.getBoundingClientRect();
    if (!vv) return { top: 0, left: 0, width: w, height: h };
    const visTop = Math.max(vv.offsetTop, host.top);
    const visLeft = Math.max(vv.offsetLeft, host.left);
    const visBottom = Math.min(vv.offsetTop + vv.height, host.bottom);
    const visRight = Math.min(vv.offsetLeft + vv.width, host.right);
    return {
      top: Math.max(0, visTop - host.top),
      left: Math.max(0, visLeft - host.left),
      width: Math.max(1, visRight - visLeft),
      height: Math.max(1, visBottom - visTop),
    };
  }

  const held = new Set<number>();

  function seedMotes() {
    motes.length = 0;
    const count = 56;
    for (let i = 0; i < count; i++) {
      motes.push({
        x: Math.random() * w,
        y: Math.random() * h * 0.7,
        s: 0.45 + Math.random() * 1.45,
        a: 0.14 + Math.random() * 0.38,
        p: Math.random() * Math.PI * 2,
        v: 5 + Math.random() * 14,
      });
    }
  }

  function layout() {
    clearLabels();
    keys.length = 0;
    held.clear();
    bars.length = 0;
    sparks.length = 0;
    seedMotes();
    // Soft tip in portrait — never block the board.
    turn.hidden = tipDismissed || !phonePortrait();

    const frame = visibleFrame();
    const chromeTop = 52;
    const chromeBottom = 58;
    const bandTop = frame.top + chromeTop;
    const bandH = Math.max(96, frame.height - chromeTop - chromeBottom);
    const gap = Math.min(10, Math.max(3, bandH * 0.018));
    const usableW = frame.width * 0.94;
    const topUnits = rows[0].reduce((sum, key) => sum + key.u, 0);
    const unit = (usableW - gap * (rows[0].length - 1)) / topUnits;
    const slack = (rows.length - 1) * gap;
    const keyH = Math.min(unit * 0.92, Math.max(16, (bandH - slack) / rows.length));
    const totalH = rows.length * keyH + slack;
    const shift = interactive ? Math.min(92, Math.max(46, bandH * 0.13)) : 0;
    let originY = bandTop + (bandH - totalH) / 2 + shift;
    const maxOrigin = bandTop + bandH - totalH;
    originY = Math.min(originY, maxOrigin);
    if (interactive) originY = Math.max(originY, Math.min(maxOrigin, bandTop + 64));
    let i = 0;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const rowUnits = row.reduce((sum, key) => sum + key.u, 0);
      const rowW = rowUnits * unit + gap * (row.length - 1);
      let x = frame.left + (frame.width - rowW) / 2;
      for (const spec of row) {
        const keyW = spec.u * unit;
        const k: Key = {
          x,
          y: originY + r * (keyH + gap),
          w: keyW,
          h: keyH,
          label: spec.label,
          pitch: 0.72 + (i % 9) * 0.04,
          press: 0,
          flash: 0,
          hold: 0,
        };
        if (spec.label) {
          const t = new Text({
            text: spec.label,
            style: {
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              fontSize: Math.max(10, Math.min(16, Math.min(keyW, keyH) * (spec.label.length > 1 ? 0.22 : 0.36))),
              fill: 0xc5d0d8,
              fontWeight: "600",
            },
          });
          t.anchor.set(0.5);
          labels.addChild(t);
          k.labelText = t;
        }
        keys.push(k);
        x += keyW + gap;
        i++;
      }
    }
  }
  layout();
  const onPortrait = () => layout();
  portraitQuery?.addEventListener("change", onPortrait);
  const vv = window.visualViewport;
  vv?.addEventListener("resize", onPortrait);
  vv?.addEventListener("scroll", onPortrait);
  let settle = 0;
  const onTurn = () => {
    window.clearTimeout(settle);
    settle = window.setTimeout(layout, 60);
  };
  window.addEventListener("orientationchange", onTurn);

  const hit = (x: number, y: number) => {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      // Include the raised side wall in the hit area
      if (x >= k.x && x <= k.x + k.w && y >= k.y - 6 && y <= k.y + k.h + 4) return i;
    }
    return null;
  };

  let pointerDown = false;

  const el = ctx.app.canvas;

  const toLocal = (clientX: number, clientY: number) => {
    const rect = el.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / Math.max(rect.width, 1)) * w,
      y: ((clientY - rect.top) / Math.max(rect.height, 1)) * h,
    };
  };

  const lineYFor = () => (keys.length ? Math.min(...keys.map((key) => key.y)) - 4 : 0);

  const barWidth = (k: Key) => Math.min(30, Math.max(10, k.w * 0.5));

  const barBase = (k: Key) => Math.max(14, Math.min(k.h * 0.72, 28));

  const spawnSparks = (k: Key, y: number) => {
    if (sparks.length > 240) sparks.splice(0, sparks.length - 150);
    const originX = k.x + k.w * 0.5;
    for (let n = 0; n < 34; n++) {
      const spread = (Math.random() - 0.5) * 1.25;
      const angle = -Math.PI / 2 + spread;
      const speed = 70 + Math.random() * 240;
      const life = 1.15 + Math.random() * 0.7;
      const hot = n < 14 || Math.random() < 0.5;
      sparks.push({
        x: originX + (Math.random() - 0.5) * k.w * 0.55,
        y: y + (Math.random() - 0.5) * 4,
        vx: Math.cos(angle) * speed * (0.55 + Math.random() * 0.8),
        vy: Math.sin(angle) * speed,
        life,
        max: life,
        size: hot ? 2.4 + Math.random() * 2.6 : 1.2 + Math.random() * 1.5,
        color: hot ? SPARK_HOT : SPARK_LILAC,
      });
    }
    for (let n = 0; n < 16; n++) {
      const spread = (Math.random() - 0.5) * 0.9;
      const angle = -Math.PI / 2 + spread;
      const speed = 24 + Math.random() * 70;
      const life = 0.9 + Math.random() * 0.45;
      sparks.push({
        x: originX + (Math.random() - 0.5) * 10,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        max: life,
        size: 2.8 + Math.random() * 2.4,
        color: n % 2 === 0 ? SPARK_HOT : SPARK_LILAC,
      });
    }
  };

  const strike = (i: number) => {
    const k = keys[i];
    if (!k) return;
    k.flash = 1;
    const base = barBase(k);
    let bar = bars.find((item) => item.index === i);
    if (!bar) {
      bar = { index: i, height: base * 0.35, life: 1 };
      bars.push(bar);
    }
    bar.life = 1;
    bar.height = Math.max(base * 0.85, Math.min(bar.height, base));
    spawnSparks(k, lineYFor());
  };

  const advanceWord = () => {
    const prev = queue[queue.length - 1];
    queue.shift();
    queue.push(pickWord(prev));
    typed = "";
  };

  const typeChar = (ch: string) => {
    if (!interactive || !queue.length) return;
    const word = queue[0] ?? "";
    if (ch === "\b") {
      if (typed.length) typed = typed.slice(0, -1);
      swallowSpace = false;
      return;
    }
    if (ch === " ") {
      if (swallowSpace) {
        swallowSpace = false;
        return;
      }
      advanceWord();
      return;
    }
    if (!/^[a-z]$/.test(ch)) return;
    swallowSpace = false;
    const expected = word[typed.length];
    if (!expected || ch !== expected) miss = 1;
    if (typed.length < word.length + 5) typed += ch;
    if (typed === word) {
      advanceWord();
      swallowSpace = true;
    }
  };

  const typeFromLabel = (label: string) => {
    if (!interactive) return;
    if (label === "bksp") {
      typeChar("\b");
      return;
    }
    if (label === "" || label === "enter") {
      typeChar(" ");
      return;
    }
    if (label.length === 1 && /[A-Z]/.test(label)) typeChar(label.toLowerCase());
  };

  const pressKey = (i: number) => {
    if (held.has(i)) return;
    held.add(i);
    const k = keys[i];
    if (!k) return;
    k.press = 1;
    k.hold = 0;
    audio.keyStroke("down", 0.9, k.pitch, kit);
    haptics.tap(12);
    strike(i);
    typeFromLabel(k.label);
  };

  const releaseKey = (i: number) => {
    if (!held.has(i)) return;
    held.delete(i);
    audio.keyStroke("up", 0.85, keys[i].pitch, kit);
  };

  const setUnderPointer = (i: number | null) => {
    for (const heldIndex of [...held]) {
      if (heldIndex !== i) releaseKey(heldIndex);
    }
    if (i != null) pressKey(i);
  };

  const onDown = (e: PointerEvent) => {
    void audio.resume();
    pointerDown = true;
    const p = toLocal(e.clientX, e.clientY);
    setUnderPointer(hit(p.x, p.y));
  };
  const onMove = (e: PointerEvent) => {
    if (!pointerDown) return;
    const p = toLocal(e.clientX, e.clientY);
    setUnderPointer(hit(p.x, p.y));
  };
  const onUp = () => {
    pointerDown = false;
    for (const i of [...held]) releaseKey(i);
  };

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.style.touchAction = "none";

  const labelFromKey = (e: KeyboardEvent) => {
    if (e.key === " ") return "";
    if (e.key === "Backspace") return "bksp";
    if (e.key === "Enter") return "enter";
    if (e.key === "Tab") return "tab";
    if (e.key === "Shift") return "shift";
    if (e.key === "CapsLock") return "caps";
    if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) return e.key.toUpperCase();
    return null;
  };

  const indexForEvent = (e: KeyboardEvent) => {
    const label = labelFromKey(e);
    if (label == null) return -1;
    if (label === "shift") {
      const wantRight = e.code === "ShiftRight" || e.location === 2;
      let seen = 0;
      for (let i = 0; i < keys.length; i++) {
        if (keys[i]?.label !== "shift") continue;
        seen += 1;
        if (wantRight ? seen === 2 : seen === 1) return i;
      }
    }
    return keys.findIndex((k) => k.label === label);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.isComposing) return;
    const target = e.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const label = labelFromKey(e);
    if (label == null) return;
    const i = indexForEvent(e);
    if (i < 0) return;
    e.preventDefault();
    void audio.resume();
    if (e.repeat) {
      const k = keys[i];
      if (!k) return;
      if (!held.has(i)) held.add(i);
      k.press = 1;
      audio.keyStroke("down", 0.9, k.pitch, kit);
      haptics.tap(8);
      typeFromLabel(label);
      return;
    }
    pressKey(i);
  };

  const onKeyUp = (e: KeyboardEvent) => {
    const i = indexForEvent(e);
    if (i >= 0) releaseKey(i);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  let DEPTH = 10;
  const KIT_KEY = "palmstone:keyboardKit";
  let kit: "thock" | "creamy" = "thock";
  try {
    const saved = localStorage.getItem(KIT_KEY);
    if (saved === "creamy" || saved === "thock") kit = saved;
  } catch {
    /* private mode */
  }
  const hud = createHud(ctx.host);
  hud.select(
    "Sound",
    [
      { value: "thock", label: "Thock" },
      { value: "creamy", label: "Creamy" },
    ],
    kit,
    (value) => {
      kit = value === "creamy" ? "creamy" : "thock";
      try {
        localStorage.setItem(KIT_KEY, kit);
      } catch {
        /* quota */
      }
    },
  );
  hud.slider("Travel", 4, 22, DEPTH, (v) => {
    DEPTH = v;
  });
  hud.toggle("Interactive", "Interactive", false, (on) => {
    interactive = on;
    held.clear();
    pointerDown = false;
    typed = "";
    swallowSpace = false;
    miss = 0;
    queue.length = 0;
    if (on) {
      let prev = "";
      for (let n = 0; n < 6; n++) {
        const word = pickWord(prev);
        queue.push(word);
        prev = word;
      }
    }
    promptSig = "";
    layout();
    void audio.resume();
  });

  return {
    update(dt: number) {
      ctx.host.dataset.thockTick = String((Number(ctx.host.dataset.thockTick) || 0) + 1);
      promptTime += dt;
      miss = Math.max(0, miss - dt * 2.4);

      const sky = lineYFor();
      for (const mote of motes) {
        mote.y -= mote.v * dt;
        mote.x += Math.sin(promptTime * 0.65 + mote.p) * 10 * dt;
        if (mote.y < -6 || (keys.length > 0 && mote.y > sky)) {
          mote.y = keys.length ? Math.random() * Math.max(8, sky) : Math.random() * h * 0.6;
          mote.x = Math.random() * w;
        }
        if (mote.x < -8) mote.x = w + 4;
        if (mote.x > w + 8) mote.x = -4;
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const spark = sparks[i];
        if (!spark) continue;
        spark.life -= dt;
        if (spark.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        spark.vy += 36 * dt;
        spark.vx *= Math.pow(0.35, dt);
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
      }

      for (let i = bars.length - 1; i >= 0; i--) {
        const bar = bars[i];
        const k = bar ? keys[bar.index] : undefined;
        if (!bar || !k || bar.life <= 0) {
          bars.splice(i, 1);
          continue;
        }
        const base = barBase(k);
        const maxH = Math.max(base + 10, Math.min(Math.max(24, sky - 18), 240));
        if (held.has(bar.index)) {
          bar.life = 1;
          const target = Math.min(maxH, base + k.hold * 128);
          bar.height += (target - bar.height) * Math.min(1, dt * 11);
        } else {
          bar.life -= dt * 1.55;
          bar.height += (base * 0.22 - bar.height) * Math.min(1, dt * 4.5);
        }
      }

      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (held.has(i)) {
          k.press = 1;
          k.hold += dt;
        } else {
          k.press = Math.max(0, k.press - dt * 7);
          k.hold = 0;
        }
        k.flash = Math.max(0, k.flash - dt * 3.2);
      }

      g.clear();
      g.rect(0, 0, w, h);
      g.fill({ color: 0x101214, alpha: 1 });
      const haze = Math.min(w, h);
      g.circle(w * 0.48, h * 0.2, haze * 0.3);
      g.fill({ color: 0x3a1868, alpha: 0.2 });
      g.circle(w * 0.36, h * 0.14, haze * 0.14);
      g.fill({ color: 0x5a2890, alpha: 0.12 });
      g.circle(w * 0.62, h * 0.26, haze * 0.12);
      g.fill({ color: 0x2a1048, alpha: 0.18 });

      if (keys.length) {
        const pad = 22;
        const minX = Math.min(...keys.map((k) => k.x)) - pad;
        const minY = Math.min(...keys.map((k) => k.y)) - pad - DEPTH;
        const maxX = Math.max(...keys.map((k) => k.x + k.w)) + pad;
        const maxY = Math.max(...keys.map((k) => k.y + k.h)) + pad + 6;
        g.roundRect(minX, minY, maxX - minX, maxY - minY, 18);
        g.fill({ color: 0x1a2026, alpha: 0.96 });
        g.roundRect(minX, minY, maxX - minX, maxY - minY, 18);
        g.stroke({ width: 2, color: 0x2e3840, alpha: 0.9 });
      }

      for (const k of keys) {
        const travel = DEPTH * 0.85;
        const drop = k.press * travel;
        const wall = DEPTH - drop;

        // Deep well
        g.roundRect(k.x - 1, k.y - 1, k.w + 2, k.h + DEPTH + 2, 10);
        g.fill({ color: 0x07090b, alpha: 0.9 });

        // Side wall (key body depth)
        if (wall > 0.5) {
          g.roundRect(k.x, k.y + drop + k.h * 0.55, k.w, wall + k.h * 0.35, 8);
          g.fill({ color: 0x1a2228, alpha: 1 });
          g.roundRect(k.x, k.y + drop + k.h * 0.55, k.w, wall + k.h * 0.35, 8);
          g.stroke({ width: 1, color: 0x0c1014, alpha: 0.8 });
        }

        // Cap top
        const capH = k.h - drop * 0.15;
        g.roundRect(k.x, k.y + drop, k.w, capH, 9);
        g.fill({ color: k.press > 0.25 ? 0x3e4a54 : 0x2c3640, alpha: 1 });
        // Bevel highlight
        g.roundRect(k.x + 3, k.y + drop + 3, k.w - 6, capH * 0.32, 6);
        g.fill({ color: 0xffffff, alpha: 0.07 + (1 - k.press) * 0.06 });
        // Bottom lip
        g.roundRect(k.x + 4, k.y + drop + capH - 7, k.w - 8, 4, 2);
        g.fill({ color: 0x000000, alpha: 0.18 });

        if (k.labelText) {
          k.labelText.x = k.x + k.w * 0.5;
          k.labelText.y = k.y + drop + capH * 0.42;
          k.labelText.alpha = 0.55 + k.press * 0.35;
        }
      }

      barG.clear();
      glowG.clear();
      if (keys.length) {
        const minX = Math.min(...keys.map((key) => key.x));
        const maxX = Math.max(...keys.map((key) => key.x + key.w));
        const lineY = sky;
        const span = Math.max(1, maxX - minX);
        glowG.rect(minX, lineY - 6, span, 12);
        glowG.fill({ color: NEON_DEEP, alpha: 0.28 });
        glowG.rect(minX, lineY - 0.8, span, 1.6);
        glowG.fill({ color: SPARK_HOT, alpha: 0.42 });
        barG.rect(minX, lineY - 0.7, span, 1.4);
        barG.fill({ color: 0xffffff, alpha: 0.88 });

        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          if (!k) continue;
          const glow = Math.max(k.flash, held.has(i) ? 1 : 0);
          if (glow < 0.03) continue;
          const drop = k.press * DEPTH * 0.85;
          glowG.roundRect(k.x - 2, k.y + drop - 2, k.w + 4, k.h + 4, 11);
          glowG.fill({ color: NEON, alpha: 0.32 * glow });
          glowG.roundRect(k.x + 3, k.y + drop + 1, k.w - 6, Math.min(k.h * 0.42, 18), 8);
          glowG.fill({ color: SPARK_HOT, alpha: 0.34 * glow });
          const bw = barWidth(k);
          const bx = k.x + (k.w - bw) / 2;
          glowG.circle(bx + bw / 2, lineY, 6);
          glowG.fill({ color: SPARK_HOT, alpha: 0.85 * glow });
        }

        for (const bar of bars) {
          const k = keys[bar.index];
          if (!k || bar.life <= 0.02 || bar.height < 2) continue;
          const alpha = Math.max(0, Math.min(1, bar.life));
          const bw = barWidth(k);
          const bh = bar.height;
          const x = k.x + (k.w - bw) / 2;
          const y = lineY - bh;
          const radius = Math.min(bw * 0.5, Math.max(5, Math.min(bh * 0.5, 10)));
          glowG.roundRect(x - 4, y - 4, bw + 8, bh + 8, radius + 3);
          glowG.fill({ color: NEON, alpha: 0.42 * alpha });
          glowG.roundRect(x, y, bw, bh, radius);
          glowG.stroke({ width: 5, color: NEON, alpha: 0.85 * alpha });
          barG.roundRect(x, y, bw, bh, radius);
          barG.fill({ color: 0x1a0a22, alpha: 0.78 * alpha });
          barG.roundRect(x, y, bw, bh, radius);
          barG.stroke({ width: 2.2, color: 0xf4e4ff, alpha: alpha });
          const slitW = Math.max(2, bw * 0.22);
          const slitH = Math.max(4, bh - Math.min(14, bh * 0.36));
          barG.roundRect(x + (bw - slitW) / 2, y + (bh - slitH) / 2, slitW, slitH, slitW / 2);
          barG.fill({ color: 0xfff8ff, alpha: 0.92 * alpha });
          glowG.circle(x + bw / 2, lineY, 4.5);
          glowG.fill({ color: SPARK_HOT, alpha: 0.55 * alpha });
        }
      }

      for (const mote of motes) {
        const twinkle = 0.65 + 0.35 * Math.sin(promptTime * 1.7 + mote.p);
        glowG.circle(mote.x, mote.y, mote.s);
        glowG.fill({ color: SPARK_LILAC, alpha: mote.a * twinkle });
      }

      for (const spark of sparks) {
        const t = Math.max(0, spark.life / spark.max);
        const fade = Math.pow(t, 0.6);
        const dx = spark.vx * 0.04;
        const dy = spark.vy * 0.04;
        glowG.moveTo(spark.x, spark.y);
        glowG.lineTo(spark.x - dx, spark.y - dy);
        glowG.stroke({ width: Math.max(0.8, spark.size * 0.7), color: spark.color, alpha: 0.85 * fade, cap: "round" });
        glowG.circle(spark.x, spark.y, spark.size * (0.45 + t * 0.35));
        glowG.fill({ color: spark.color, alpha: 0.9 * fade });
      }

      const word = queue[0];
      if (!interactive || !keys.length || !word) {
        if (prompt.visible) {
          prompt.visible = false;
          for (const child of promptLabels.removeChildren()) child.destroy();
          caretBox = null;
          promptWidth = 0;
          promptSig = "";
          promptG.clear();
        }
      } else {
        prompt.visible = true;
        const minX = Math.min(...keys.map((key) => key.x));
        const maxX = Math.max(...keys.map((key) => key.x + key.w));
        const minY = Math.min(...keys.map((key) => key.y));
        const boardW = maxX - minX;
        const fontSize = Math.round(Math.max(20, Math.min(34, Math.min(w * 0.028, boardW / 22))));
        const sig = `${fontSize}|${queue.join(" ")}|${typed}`;
        if (sig !== promptSig) {
          promptSig = sig;
          for (const child of promptLabels.removeChildren()) child.destroy();
          caretBox = null;
          const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
          const pieces: { ch: string; fill: number; caret: boolean }[] = [];
          for (let i = 0; i < word.length; i++) {
            if (i < typed.length) {
              const ok = typed[i] === word[i];
              pieces.push({ ch: typed[i] ?? "", fill: ok ? 0x9dceb0 : 0xe08576, caret: false });
            } else {
              pieces.push({
                ch: word[i] ?? "",
                fill: i === typed.length ? 0xf7f4ee : 0xc5d0d8,
                caret: i === typed.length,
              });
            }
          }
          for (let i = word.length; i < typed.length; i++) {
            pieces.push({ ch: typed[i] ?? "", fill: 0xe08576, caret: false });
          }
          let cursor = 0;
          const gap = fontSize * 0.62;
          for (const piece of pieces) {
            const glyph = new Text({
              text: piece.ch,
              style: { fontFamily: mono, fontSize, fill: piece.fill, fontWeight: "600" },
            });
            glyph.x = cursor;
            promptLabels.addChild(glyph);
            const gw = Math.max(glyph.width, fontSize * 0.55);
            if (piece.caret) caretBox = { x: cursor, y: 1, w: gw, h: fontSize };
            cursor += gw;
          }
          if (typed.length >= word.length) caretBox = { x: cursor, y: 1, w: fontSize * 0.28, h: fontSize };
          cursor += gap * 0.4;
          const maxW = Math.min(w * 0.92, boardW * 1.08);
          for (const upcoming of queue.slice(1, 5)) {
            const glyph = new Text({
              text: upcoming,
              style: { fontFamily: mono, fontSize, fill: 0x667480, fontWeight: "600" },
            });
            if (cursor + glyph.width > maxW && cursor > fontSize) {
              glyph.destroy();
              break;
            }
            glyph.x = cursor;
            promptLabels.addChild(glyph);
            cursor += glyph.width + gap;
          }
          promptWidth = cursor;
        }
        const lineH = fontSize * 1.35;
        prompt.x = (minX + maxX) / 2 - promptWidth / 2;
        prompt.y = Math.max(10, minY - 22 - DEPTH - 14 - lineH);
      }

      ctx.host.dataset.thock = JSON.stringify({
        interactive,
        word: queue[0] ?? "",
        typed,
        keyTop: keys.length ? Math.min(...keys.map((key) => key.y)) : 0,
        bars: bars.map((bar) => ({
          label: keys[bar.index]?.label || "space",
          h: Math.round(bar.height),
        })),
        sparks: sparks.length,
        keys: keys.filter((key) => key.label.length <= 1).map((key) => ({
          label: key.label || "space",
          x: key.x + key.w / 2,
          y: key.y + key.h / 2,
        })),
      });

      promptG.clear();
      if (prompt.visible && caretBox) {
        const blink = miss > 0 ? 1 : 0.62 + 0.38 * Math.sin(promptTime * 6);
        const color = miss > 0 ? 0xe08576 : 0xe7e2d6;
        promptG.roundRect(caretBox.x - 4, caretBox.y - 3, caretBox.w + 8, caretBox.h + 8, 7);
        promptG.fill({ color: 0x243038, alpha: 0.92 * blink });
        promptG.roundRect(caretBox.x - 4, caretBox.y + caretBox.h + 2, caretBox.w + 8, 3, 2);
        promptG.fill({ color, alpha: 0.9 * blink });
      }
    },
    resize(nw, nh) {
      w = nw;
      h = nh;
      layout();
    },
    destroy() {
      hud.destroy();
      turn.remove();
      portraitQuery?.removeEventListener("change", onPortrait);
      vv?.removeEventListener("resize", onPortrait);
      vv?.removeEventListener("scroll", onPortrait);
      window.removeEventListener("orientationchange", onTurn);
      window.clearTimeout(settle);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      clearLabels();
      layer.destroy({ children: true });
    },
  };
}

export const keyboardThock: ExperienceModule = {
  id: "keyboard-thock",
  collection: "field",
  name: "Keyboard Thock",
  modality: "Click",
  tagline: "Chunky bottom-out — soft plastic thock under the finger.",
  hint: "Tap a key, or drag across the board. Release lifts the key.",
  accent: "#7a8a98",
  mount,
};
