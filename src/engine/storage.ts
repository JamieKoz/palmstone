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
  noteExperienceOpen(id);
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

const PROFILE_KEY = "palmstone:profile";

export type ExperienceStats = {
  seconds: number;
  opens: number;
  lastPlayed: number;
  pointerDowns: number;
  holdMs: number;
  dragPx: number;
};

type Profile = {
  experiences: Record<string, ExperienceStats>;
};

function emptyStats(): ExperienceStats {
  return { seconds: 0, opens: 0, lastPlayed: 0, pointerDowns: 0, holdMs: 0, dragPx: 0 };
}

function getProfile(): Profile {
  const raw = readJson<Profile>(PROFILE_KEY, { experiences: {} });
  if (!raw.experiences || typeof raw.experiences !== "object") return { experiences: {} };
  return raw;
}

function writeProfile(profile: Profile) {
  writeJson(PROFILE_KEY, profile);
}

function touch(id: string): { profile: Profile; stats: ExperienceStats } {
  const profile = getProfile();
  const stats = profile.experiences[id] ?? emptyStats();
  profile.experiences[id] = stats;
  stats.lastPlayed = Date.now();
  return { profile, stats };
}

export function noteExperienceOpen(id: string) {
  const { profile, stats } = touch(id);
  stats.opens += 1;
  writeProfile(profile);
}

export function recordExperiencePlay(id: string, seconds: number) {
  if (seconds < 0.5) return;
  const { profile, stats } = touch(id);
  stats.seconds += seconds;
  writeProfile(profile);
}

export function recordPointerBurst(
  id: string,
  burst: { downs: number; holdMs: number; dragPx: number },
) {
  if (burst.downs <= 0 && burst.holdMs <= 0 && burst.dragPx <= 0) return;
  const { profile, stats } = touch(id);
  stats.pointerDowns += burst.downs;
  stats.holdMs += burst.holdMs;
  stats.dragPx += burst.dragPx;
  writeProfile(profile);
}

export type FeelBias = "calm" | "lively";

/** Enough strokes to lean the starting gravity. Null means leave the default. */
export function getFeelBias(): FeelBias | null {
  const stats = Object.values(getProfile().experiences);
  let downs = 0;
  let hold = 0;
  let drag = 0;
  for (const s of stats) {
    downs += s.pointerDowns;
    hold += s.holdMs;
    drag += s.dragPx;
  }
  if (downs < 8) return null;
  const dragPer = drag / downs;
  const holdPer = hold / downs;
  if (dragPer > 90 || holdPer > 480) return "lively";
  if (dragPer < 28 && holdPer < 200) return "calm";
  return null;
}

/** Starting gravity multiplier for field toys. */
export function gravityFromFeel(): number {
  const bias = getFeelBias();
  if (bias === "lively") return 1.45;
  if (bias === "calm") return 0.72;
  return 1;
}

function affinityScore(id: string, favourite: boolean): number {
  const stats = getProfile().experiences[id];
  if (!stats) return 0;
  const ageDays = Math.max(0, (Date.now() - stats.lastPlayed) / 86_400_000);
  const recency = Math.exp(-ageDays / 10);
  const interaction = Math.log1p(stats.pointerDowns + stats.dragPx / 120);
  return (stats.seconds * (1 + interaction * 0.35) + stats.opens * 2) * recency * (favourite ? 1.4 : 1);
}

export function topAffinityIds(limit = 4): string[] {
  const favs = new Set(getFavourites());
  return Object.keys(getProfile().experiences)
    .map((id) => ({ id, score: affinityScore(id, favs.has(id)) }))
    .filter((row) => row.score > 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.id);
}

export function sortByAffinity<T extends { id: string }>(items: T[]): T[] {
  const favs = new Set(getFavourites());
  return items
    .map((item, index) => ({
      item,
      index,
      score: affinityScore(item.id, favs.has(item.id)),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.item);
}
