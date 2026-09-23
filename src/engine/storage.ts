const FAV_KEY = "palmstone:favourites";
const MUTE_KEY = "palmstone:muted";
const HAP_KEY = "palmstone:haptics";
const RECENT_KEY = "palmstone:recents";

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

export function getHapticsPref(): boolean {
  return readJson<boolean>(HAP_KEY, true);
}

export function setHapticsPref(enabled: boolean) {
  writeJson(HAP_KEY, enabled);
}

export function pushRecent(id: string) {
  const prev = readJson<string[]>(RECENT_KEY, []).filter((x) => x !== id);
  writeJson(RECENT_KEY, [id, ...prev].slice(0, 8));
}

export function getRecents(): string[] {
  return readJson<string[]>(RECENT_KEY, []);
}
