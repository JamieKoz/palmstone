const FAV_KEY = "palmstone:favourites";
const MUTE_KEY = "palmstone:muted";
const MUSIC_MUTE_KEY = "palmstone:musicMuted";
const HAP_KEY = "palmstone:haptics";
const RECENT_KEY = "palmstone:recents";
const MODALITY_KEY = "palmstone:modalitySeconds";
const SESSIONS_KEY = "palmstone:sessionCount";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

export function getFavourites(): string[] {
  return readJson<string[]>(FAV_KEY, []);
}

export function isFavourite(id: string): boolean {
  return getFavourites().includes(id);
}

export function toggleFavourite(id: string): boolean {
  const set = new Set(getFavourites());
  if (set.has(id)) set.delete(id);
  else set.add(id);
  const next = Array.from(set);
  writeJson(FAV_KEY, next);
  return set.has(id);
}

export function getMuted(): boolean {
  return readJson<boolean>(MUTE_KEY, false);
}

export function setMutedPref(muted: boolean) {
  writeJson(MUTE_KEY, muted);
}

export function getMusicMuted(): boolean {
  return readJson<boolean>(MUSIC_MUTE_KEY, false);
}

export function setMusicMutedPref(muted: boolean) {
  writeJson(MUSIC_MUTE_KEY, muted);
}

export function getHapticsPref(): boolean {
  return readJson<boolean>(HAP_KEY, true);
}

export function setHapticsPref(enabled: boolean) {
  writeJson(HAP_KEY, enabled);
}

export function pushRecent(id: string) {
  const prev = readJson<string[]>(RECENT_KEY, []).filter((x) => x !== id);
  writeJson(RECENT_KEY, [id, ...prev].slice(0, 8));
  const sessions = readJson<number>(SESSIONS_KEY, 0);
  writeJson(SESSIONS_KEY, sessions + 1);
}

export function getRecents(): string[] {
  return readJson<string[]>(RECENT_KEY, []);
}

export function getSessionCount(): number {
  return readJson<number>(SESSIONS_KEY, 0);
}

/** Accumulate seconds played per modality (client-side habit signal). */
export function recordModalityPlay(modality: string, seconds: number) {
  if (seconds < 0.5) return;
  const map = readJson<Record<string, number>>(MODALITY_KEY, {});
  map[modality] = (map[modality] ?? 0) + seconds;
  writeJson(MODALITY_KEY, map);
}

export function getModalitySeconds(): Record<string, number> {
  return readJson<Record<string, number>>(MODALITY_KEY, {});
}

/** Top modalities by play time — empty if not enough signal. */
export function getPreferredModalities(limit = 2): string[] {
  const map = getModalitySeconds();
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .filter(([, s]) => s >= 8)
    .slice(0, limit)
    .map(([m]) => m);
}
