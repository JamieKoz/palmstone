import type { ReactNode } from "react";
import type { ExperienceId } from "@/engine/types";

function Frame({ fill, children }: { fill: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden>
      <rect width="48" height="48" fill={fill} />
      {children}
    </svg>
  );
}

function gearPath(cx: number, cy: number, r: number, teeth: number, rot: number) {
  const inner = r * 0.72;
  const parts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a0 = rot + (i / teeth) * Math.PI * 2;
    const span = (Math.PI * 2) / teeth;
    const tooth = span * 0.46;
    const gap = (span - tooth) / 2;
    const p = (a: number, rad: number) =>
      `${(cx + Math.cos(a) * rad).toFixed(2)},${(cy + Math.sin(a) * rad).toFixed(2)}`;
    parts.push(i === 0 ? `M ${p(a0, inner)}` : `L ${p(a0, inner)}`);
    parts.push(`L ${p(a0 + gap, r)}`);
    parts.push(`L ${p(a0 + gap + tooth, r)}`);
    parts.push(`L ${p(a0 + span, inner)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

function ElasticWebThumb() {
  const cols = 4;
  const rows = 5;
  const rest = Array.from({ length: cols * rows }, (_, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    return {
      x: 8 + (c / (cols - 1)) * 32,
      y: 7 + (r / (rows - 1)) * 34,
    };
  });
  const grab = 2 * cols + 2;
  const pts = rest.map((p) => ({ ...p }));
  pts[grab] = { x: rest[grab].x + 6.5, y: rest[grab].y + 4.5 };
  for (const n of [grab - 1, grab + 1, grab - cols, grab + cols]) {
    if (n < 0 || n >= pts.length) continue;
    pts[n].x += (pts[grab].x - rest[grab].x) * 0.32;
    pts[n].y += (pts[grab].y - rest[grab].y) * 0.32;
  }
  const lines: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (c < cols - 1) lines.push([i, i + 1]);
      if (r < rows - 1) lines.push([i, i + cols]);
    }
  }
  return (
    <Frame fill="#14110f">
      {lines.map(([a, b], i) => (
        <line
          key={i}
          x1={pts[a].x}
          y1={pts[a].y}
          x2={pts[b].x}
          y2={pts[b].y}
          stroke="#d8c3a0"
          strokeWidth="0.9"
          strokeOpacity="0.7"
        />
      ))}
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === grab ? 2.35 : 1.55}
          fill={i === grab ? "#f0d9a8" : "#c9a66b"}
        />
      ))}
    </Frame>
  );
}

const THUMBS: Record<ExperienceId, ReactNode> = {
  "mesh-lattice": (
    <Frame fill="#0c1214">
      {[7, 12, 17].map((r) => (
        <ellipse
          key={r}
          cx="24"
          cy="24"
          rx={r}
          ry={r * 0.78}
          fill="none"
          stroke="#6db8b0"
          strokeWidth="0.85"
          strokeOpacity={r === 17 ? 0.45 : 0.85}
        />
      ))}
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2 - 0.4;
        return (
          <line
            key={i}
            x1="24"
            y1="24"
            x2={24 + Math.cos(a) * 18}
            y2={24 + Math.sin(a) * 14}
            stroke="#8fd0c6"
            strokeWidth="0.7"
            strokeOpacity="0.75"
          />
        );
      })}
      <circle cx="24" cy="24" r="1.7" fill="#e7f7f3" />
    </Frame>
  ),
  "sand-tray": (
    <Frame fill="#1a1612">
      <path
        d="M6 18 C16 22, 28 14, 42 20"
        fill="none"
        stroke="#2a2218"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M8 30 C18 26, 30 34, 42 28"
        fill="none"
        stroke="#2a2218"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {[
        [9, 10, 1.5],
        [15, 12, 1.1],
        [22, 9, 1.7],
        [30, 13, 1.2],
        [37, 10, 1.4],
        [12, 22, 1.8],
        [20, 20, 1.2],
        [27, 24, 1.6],
        [35, 19, 1.3],
        [8, 32, 1.2],
        [16, 34, 1.6],
        [24, 31, 1.1],
        [32, 35, 1.7],
        [40, 30, 1.3],
        [18, 40, 1.4],
        [28, 41, 1.2],
      ].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={i % 3 === 0 ? "#e2c89a" : "#c4a574"} />
      ))}
    </Frame>
  ),
  "silk-fluid": (
    <Frame fill="#101614">
      <path
        d="M-2 30 C10 8, 20 40, 50 14"
        fill="none"
        stroke="#6db3a8"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeOpacity="0.9"
      />
      <path
        d="M-2 16 C14 30, 26 6, 50 24"
        fill="none"
        stroke="#e07a6a"
        strokeWidth="3"
        strokeLinecap="round"
        strokeOpacity="0.75"
      />
      <path
        d="M2 40 C16 24, 30 42, 48 26"
        fill="none"
        stroke="#c9a66b"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeOpacity="0.85"
      />
      <path
        d="M8 8 C18 18, 28 4, 42 14"
        fill="none"
        stroke="#8fd0c4"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeOpacity="0.7"
      />
    </Frame>
  ),
  "ripple-pool": (
    <Frame fill="#0e1a20">
      <ellipse cx="24" cy="26" rx="19" ry="9" fill="#16303a" />
      <ellipse cx="24" cy="26" rx="16" ry="7.2" fill="none" stroke="#6a9fb5" strokeWidth="0.8" strokeOpacity="0.4" />
      <ellipse cx="24" cy="26" rx="11" ry="5" fill="none" stroke="#8ec0d4" strokeWidth="1" strokeOpacity="0.65" />
      <ellipse cx="24" cy="26" rx="6" ry="2.7" fill="none" stroke="#e7f4fa" strokeWidth="1.15" strokeOpacity="0.9" />
      <circle cx="24" cy="26" r="1.5" fill="#f4fbfd" />
      <g transform="translate(33 14) rotate(-18)">
        <path d="M4.2 0 C2.8 -1.9 -2.6 -1.6 -3.2 0 C-2.6 1.6 2.8 1.9 4.2 0 Z" fill="#d4ebf3" />
        <path d="M-2.6 0 L-6.2 -2.1 L-4.8 0 L-6.2 2.1 Z" fill="#8eb9c9" />
      </g>
    </Frame>
  ),
  "elastic-web": <ElasticWebThumb />,
  "magnetic-field": (
    <Frame fill="#10141c">
      <path
        d="M16 10 C28 10, 28 18, 16 18"
        fill="none"
        stroke="#d7c3a4"
        strokeWidth="1.1"
        strokeOpacity="0.65"
      />
      <path
        d="M16 30 C28 30, 28 38, 16 38"
        fill="none"
        stroke="#d7c3a4"
        strokeWidth="1.1"
        strokeOpacity="0.65"
      />
      {[
        [22, 14, 28, 14],
        [21, 20, 27, 22],
        [22, 24, 27, 24],
        [21, 28, 27, 26],
        [22, 34, 28, 34],
        [12, 14, 8, 12],
        [12, 34, 8, 36],
      ].map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#d7c3a4"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeOpacity="0.75"
        />
      ))}
      <circle cx="15" cy="24" r="6.5" fill="#1a222c" stroke="#7eb6c9" strokeWidth="1.8" />
      <circle cx="15" cy="24" r="2.6" fill="#7eb6c9" />
      <circle cx="34" cy="24" r="6.5" fill="#1a222c" stroke="#d08972" strokeWidth="1.8" />
      <circle cx="34" cy="24" r="2.6" fill="#d08972" />
      <line x1="31.2" y1="24" x2="36.8" y2="24" stroke="#1a222c" strokeWidth="1.2" />
    </Frame>
  ),
  "gear-mesh": (
    <Frame fill="#161410">
      <path d={gearPath(17, 22, 12, 8, 0.16)} fill="#c4b08a" />
      <circle cx="17" cy="22" r="5" fill="#3a342c" stroke="#d8c8a4" strokeWidth="1" />
      <circle cx="17" cy="22" r="1.8" fill="#1c1814" />
      <path d={gearPath(32.4, 30.2, 8.5, 7, 3.7)} fill="#d4c29a" />
      <circle cx="32.4" cy="30.2" r="3.4" fill="#3a342c" stroke="#d8c8a4" strokeWidth="0.8" />
      <circle cx="32.4" cy="30.2" r="1.3" fill="#1c1814" />
      <circle cx="24.2" cy="25.6" r="1.15" fill="#ffc24a" />
      <circle cx="25.6" cy="23.4" r="0.7" fill="#fff6e0" />
      <circle cx="17" cy="11" r="2.1" fill="#e7d7b4" />
      <circle cx="17" cy="11" r="0.8" fill="#2a241c" />
    </Frame>
  ),
  "orbit-beads": (
    <Frame fill="#0c1018">
      <circle cx="24" cy="24" r="16" fill="#1a2740" fillOpacity="0.7" />
      <circle cx="24" cy="24" r="15" fill="none" stroke="#9ec0ee" strokeWidth="1.2" strokeOpacity="0.7" />
      <circle cx="24" cy="24" r="9" fill="none" stroke="#8aa4c8" strokeWidth="0.8" strokeOpacity="0.45" />
      <circle cx="24" cy="24" r="2.2" fill="#d5e4f8" fillOpacity="0.8" />
      <circle cx="39" cy="24" r="2.6" fill="#7eb0e8" />
      <circle cx="38.2" cy="23.2" r="0.8" fill="#fff" fillOpacity="0.4" />
      <circle cx="16" cy="13" r="2.3" fill="#e0a070" />
      <circle cx="18" cy="34" r="2.1" fill="#8fce9a" />
    </Frame>
  ),
  "pulse-pads": (
    <Frame fill="#121018">
      {[
        [14, 15, "#7a9e6a", false],
        [34, 15, "#8fbc6a", true],
        [14, 34, "#6a9e8f", false],
        [34, 34, "#b0a070", false],
      ].map(([x, y, tint, hot], i) => (
        <g key={i}>
          {hot ? <circle cx={x as number} cy={y as number} r="9" fill="#c5e1a5" fillOpacity="0.28" /> : null}
          <circle cx={x as number} cy={y as number} r="6.4" fill="#2a3830" stroke={tint as string} strokeWidth="1.4" />
        </g>
      ))}
    </Frame>
  ),
  "stone-polish": (
    <Frame fill="#161410">
      <defs>
        <linearGradient id="thumb-stone" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5c564e" />
          <stop offset="0.42" stopColor="#a89a84" />
          <stop offset="0.62" stopColor="#f6f1e6" />
          <stop offset="1" stopColor="#8d8274" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="14" fill="url(#thumb-stone)" />
      <path d="M16 16 C20 12, 26 14, 28 20" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.45" />
    </Frame>
  ),
  "slider-loom": (
    <Frame fill="#121614">
      <rect x="6" y="8" width="36" height="4.5" rx="2" fill="#3a3328" />
      <rect x="6" y="35.5" width="36" height="4.5" rx="2" fill="#3a3328" />
      {[12, 18, 24, 30, 36].map((x, i) => {
        const bow = i === 2 ? 7 : i === 1 || i === 3 ? 3 : 0;
        return (
          <path
            key={x}
            d={`M ${x} 12.5 Q ${x + bow} 24 ${x} 35.5`}
            fill="none"
            stroke="#d9c7a2"
            strokeWidth="1.45"
          />
        );
      })}
      <rect x="22" y="19.5" width="16" height="8.5" rx="3.5" fill="#cbb992" stroke="#6a5438" strokeWidth="0.8" />
      <circle cx="30" cy="23.7" r="1.5" fill="#3a2e22" />
    </Frame>
  ),
  "pen-clicker": (
    <Frame fill="#121418">
      <path d="M31.4 16.5 V24.5" fill="none" stroke="#d5dee4" strokeWidth="1.35" strokeLinecap="round" />
      <circle cx="31.5" cy="25.2" r="1.25" fill="#e7eef2" />
      <rect x="18.4" y="14" width="10.2" height="15" rx="2" fill="#243e52" />
      <rect x="18.4" y="14" width="2.6" height="15" rx="1" fill="#8aafc4" fillOpacity="0.55" />
      <rect x="18.1" y="18.2" width="10.8" height="1.6" rx="0.4" fill="#6a8fad" />
      <rect x="17.6" y="28.2" width="11.8" height="5.6" rx="1.2" fill="#12181d" />
      <path d="M19.2 33.2 H27.8 L26.2 37.4 H20.8 Z" fill="#c5ced4" />
      <rect x="23.25" y="37" width="1.5" height="2.7" rx="0.5" fill="#dfe6ea" />
      <circle cx="24" cy="40.1" r="0.9" fill="#23282c" />
      <rect x="17.2" y="11.2" width="12.6" height="4.2" fill="#a8b3bb" />
      <rect x="17.2" y="11.2" width="12.6" height="1.1" fill="#e7eef2" />
      <rect x="20.4" y="6.4" width="6.2" height="6.2" rx="1.2" fill="#b7c2c8" />
      <ellipse cx="23.5" cy="6.6" rx="3.1" ry="2.5" fill="#d5dee4" />
      <ellipse cx="22.4" cy="5.6" rx="1.2" ry="0.7" fill="#fff" fillOpacity="0.9" />
    </Frame>
  ),
  "light-switch": (
    <Frame fill="#0c0e12">
      <circle cx="24" cy="10" r="14" fill="#f5e6c8" fillOpacity="0.22" />
      <rect x="16" y="8" width="16" height="32" rx="3" fill="#e8e2d6" />
      <rect x="20.5" y="14" width="7" height="20" rx="2" fill="#2a2a28" />
      <rect x="18.5" y="14" width="11" height="10" rx="2" fill="#f4f0e6" />
      <circle cx="24" cy="6" r="2.1" fill="#ffe6a0" />
    </Frame>
  ),
  "lamp-toggle": (
    <Frame fill="#12141a">
      <rect y="37" width="48" height="11" fill="#0c0e12" />
      <path d="M8 34 L40 34 L37.5 38 L10.5 38 Z" fill="#2a2218" />
      <path d="M17 9 L31 9 L34 21 L14 21 Z" fill="#3a3a3a" />
      <ellipse cx="24" cy="21" rx="10" ry="2.6" fill="#fffa89" fillOpacity="0.85" />
      <rect x="23" y="21" width="2" height="13" fill="#2c2c2c" />
      <path d="M31 12 C36 18, 33 26, 37 33" fill="none" stroke="#c9c9c9" strokeWidth="1.1" />
      <circle cx="37" cy="35" r="3.1" fill="#f7bd32" />
      <circle cx="36" cy="34" r="1" fill="#fff" fillOpacity="0.4" />
    </Frame>
  ),
  "keyboard-thock": (
    <Frame fill="#101214">
      <rect x="5" y="8" width="38" height="32" rx="4" fill="#1a2026" stroke="#2e3840" strokeWidth="1" />
      {[
        [8, 12],
        [17, 12],
        [26, 12],
        [35, 12],
        [8, 21],
        [17, 21.8],
        [26, 21],
        [35, 21],
        [12, 30],
        [24, 30],
        [33, 30],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="7" height="6.2" rx="1.4" fill={i === 5 ? "#3e4a54" : "#2c3640"} />
      ))}
    </Frame>
  ),
  "mouse-click": (
    <Frame fill="#111418">
      <path
        d="M15 20 Q15 8 24 8 Q33 8 33 20 L33 32 Q33 42 24 42 Q15 42 15 32 Z"
        fill="#2a3038"
      />
      <path d="M15 18 Q15 10 24 10 L24 20 Z" fill="#343c46" />
      <path d="M33 18 Q33 10 24 10 L24 20 Z" fill="#3a4450" />
      <rect x="22.2" y="16" width="3.6" height="7" rx="1.6" fill="#1e242c" />
    </Frame>
  ),
  "big-button": (
    <Frame fill="#121018">
      <circle cx="24" cy="26" r="16" fill="#1a2220" stroke="#343e3a" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="12" fill="#c45a4a" />
      <circle cx="20" cy="20" r="4" fill="#fff" fillOpacity="0.22" />
      <circle cx="24" cy="24" r="8" fill="none" stroke="#8a3028" strokeWidth="0.8" strokeOpacity="0.5" />
    </Frame>
  ),
  "bubble-wrap": (
    <Frame fill="#14181c">
      <rect x="6" y="8" width="36" height="32" rx="4" fill="#2a3a42" fillOpacity="0.55" />
      {[
        [14, 16, true],
        [24, 16, false],
        [34, 16, true],
        [14, 26, true],
        [24, 26, true],
        [34, 26, false],
        [14, 36, true],
        [24, 36, true],
        [34, 36, true],
      ].map(([x, y, full], i) =>
        full ? (
          <g key={i}>
            <circle cx={x as number} cy={y as number} r="3.6" fill="#6a9aaa" fillOpacity="0.7" />
            <circle cx={(x as number) - 1} cy={(y as number) - 1} r="1.2" fill="#fff" fillOpacity="0.4" />
          </g>
        ) : (
          <circle
            key={i}
            cx={x as number}
            cy={y as number}
            r="3.4"
            fill="none"
            stroke="#4a5a62"
            strokeWidth="1"
          />
        ),
      )}
    </Frame>
  ),
  "fidget-cube": (
    <Frame fill="#101216">
      <polygon points="24,7 41,16 24,25 7,16" fill="#3a424c" />
      <polygon points="7,16 24,25 24,43 7,34" fill="#2a3038" />
      <polygon points="24,25 41,16 41,34 24,43" fill="#c45a4a" />
      <polygon points="24,10 38,17.5 24,25 10,17.5" fill="#8a7d6c" fillOpacity="0.95" />
      <circle cx="24" cy="17.5" r="1.7" fill="#d9d2c6" />
      <circle cx="32" cy="30" r="3.1" fill="#f3ebe3" />
      <circle cx="32" cy="24.6" r="1.7" fill="#e7ddd2" />
      <circle cx="32" cy="35.2" r="1.7" fill="#e7ddd2" />
      <circle cx="27.2" cy="30" r="1.7" fill="#e7ddd2" />
      <circle cx="36.6" cy="30" r="1.7" fill="#e7ddd2" />
    </Frame>
  ),
  "fidget-spinner": (
    <Frame fill="#12161c">
      {[0, 120, 240].map((deg) => (
        <g key={deg} transform={`rotate(${deg} 24 24)`}>
          <rect x="22.4" y="11" width="3.2" height="13" rx="1.6" fill="#6a8aaa" />
          <circle cx="24" cy="12" r="4.6" fill="#7a9aba" />
          <circle cx="22.6" cy="10.6" r="1.4" fill="#fff" fillOpacity="0.35" />
        </g>
      ))}
      <circle cx="24" cy="24" r="3.3" fill="#d7e2f0" />
      <circle cx="24" cy="24" r="1.3" fill="#1a222c" />
    </Frame>
  ),
  zipper: (
    <Frame fill="#14161a">
      <path d="M18 4 L22 4 L20.5 44 L15.5 44 Z" fill="#3a4a5a" />
      <path d="M30 4 L26 4 L27.5 44 L32.5 44 Z" fill="#324050" />
      {[7, 11, 15].map((y) => (
        <rect key={y} x="20" y={y} width="8" height="2.6" rx="0.6" fill="#c4b080" />
      ))}
      {[28, 32, 36, 40].map((y) => (
        <g key={y}>
          <rect x="13" y={y} width="5" height="2.4" rx="0.5" fill="#b0a070" />
          <rect x="30" y={y} width="5" height="2.4" rx="0.5" fill="#b0a070" />
        </g>
      ))}
      <rect x="16" y="18" width="16" height="9" rx="2" fill="#d4c490" />
      <rect x="18" y="19.5" width="12" height="4" rx="1" fill="#f0e6c0" fillOpacity="0.6" />
      <path d="M21 27 L27 27 L26 35 L22 35 Z" fill="#c4b080" />
    </Frame>
  ),
};

export function ExperienceThumb({ id }: { id: ExperienceId }) {
  return <span className="folder-sheet__thumb">{THUMBS[id]}</span>;
}
