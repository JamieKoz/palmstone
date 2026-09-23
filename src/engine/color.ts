/**
 * Clamp RGB channels and pack to a Pixi-safe 0xRRGGBB int.
 * Prevents "Unable to convert color -N" when channels go negative.
 */
export function rgb(r: number, g: number, b: number): number {
  const R = Math.max(0, Math.min(255, r | 0));
  const G = Math.max(0, Math.min(255, g | 0));
  const B = Math.max(0, Math.min(255, b | 0));
  return (R << 16) | (G << 8) | B;
}

export function hslToRgb(h: number, s: number, l: number): number {
  const hh = ((h % 1) + 1) % 1;
  const ss = Math.max(0, Math.min(1, s));
  const ll = Math.max(0, Math.min(1, l));
  const a = ss * Math.min(ll, 1 - ll);
  const f = (n: number) => {
    const k = (n + hh * 12) % 12;
    return Math.round(255 * (ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)));
  };
  return rgb(f(0), f(8), f(4));
}
