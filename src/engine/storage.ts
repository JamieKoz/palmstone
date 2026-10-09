import type { Need } from "./needs";

const FAV_KEY = "palmstone:favourites";
/** Same-tab signal — `storage` events only fire across windows. */
export const FAVOURITES_EVENT = "palmstone:favourites";
const MUTE_KEY = "palmstone:muted";
const MUSIC_MUTE_KEY = "palmstone:musicMuted";
const HAP_KEY = "palmstone:haptics";
const RECENT_KEY = "palmstone:recents";
const MODALITY_KEY = "palmstone:modalitySeconds";
const SESSIONS_KEY = "palmstone:sessionCount";
const SESSION_LOG_KEY = "palmstone:sessions";
const LAST_NEED_KEY = "palmstone:lastNeed";
const SOUND_LEVEL_KEY = "palmstone:soundLevel";
const ACTIVE_SESSION_KEY = "palmstone:activeSession";

export type SessionFeedback = "better" | "same" | "worse";

export type SessionRecord = {
  id: string;
  experienceId: string;
  need: Need | null;
  startedAt: number;
  durationMs: number;
  plannedMs: number | null;
  completed: boolean;
  feedback: SessionFeedback | null;
  hour: number;
  soundLevel: SoundLevel | null;
  hapticsOn: boolean;
  interactions: number;
};

export type SoundLevel = "off" | "soft" | "immersive";

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
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(FAVOURITES_EVENT));
  }
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

export function experienceStatList(): ExperienceStats & { id: string } extends never
  ? never
  : { id: string; opens: number; seconds: number; pointerDowns: number; dragPx: number }[] {
  const profile = getProfile();
  return Object.entries(profile.experiences).map(([id, stats]) => ({
    id,
    opens: stats.opens,
    seconds: stats.seconds,
    pointerDowns: stats.pointerDowns,
    dragPx: stats.dragPx,
  }));
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
  if (burst.downs > 0) {
    const active = getActiveSessionId();
    if (active) {
      const log = readSessionLog();
      const row = log.find((r) => r.id === active);
      if (row) {
        patchSessionRecord(active, { interactions: (row.interactions ?? 0) + burst.downs });
      }
    }
  }
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

export function getLastNeed(): Need | null {
  const raw = readJson<string | null>(LAST_NEED_KEY, null);
  if (
    raw === "settle" ||
    raw === "focus" ||
    raw === "stimulate" ||
    raw === "hands" ||
    raw === "worlds" ||
    raw === "explore"
  ) {
    return raw;
  }
  return null;
}

export function setLastNeed(need: Need) {
  writeJson(LAST_NEED_KEY, need);
}

export function getSoundLevel(): SoundLevel | null {
  const raw = readJson<string | null>(SOUND_LEVEL_KEY, null);
  if (raw === "off" || raw === "soft" || raw === "immersive") return raw;
  return null;
}

export function setSoundLevel(level: SoundLevel) {
  writeJson(SOUND_LEVEL_KEY, level);
  if (level === "off") {
    setMutedPref(true);
    setMusicMutedPref(true);
  } else if (level === "soft") {
    setMutedPref(false);
    setMusicMutedPref(false);
  } else {
    setMutedPref(false);
    setMusicMutedPref(false);
  }
}

function readSessionLog(): SessionRecord[] {
  return readJson<SessionRecord[]>(SESSION_LOG_KEY, []);
}

function writeSessionLog(rows: SessionRecord[]) {
  writeJson(SESSION_LOG_KEY, rows.slice(0, 50));
}

export function startSessionRecord(
  experienceId: string,
  need: Need | null,
  plannedMs: number | null,
): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const row: SessionRecord = {
    id,
    experienceId,
    need,
    startedAt: Date.now(),
    durationMs: 0,
    plannedMs,
    completed: false,
    feedback: null,
    hour: new Date().getHours(),
    soundLevel: getSoundLevel(),
    hapticsOn: getHapticsPref(),
    interactions: 0,
  };
  writeJson(ACTIVE_SESSION_KEY, id);
  const log = readSessionLog();
  writeSessionLog([row, ...log]);
  return id;
}

export function getActiveSessionId(): string | null {
  return readJson<string | null>(ACTIVE_SESSION_KEY, null);
}

export function patchSessionRecord(
  sessionId: string,
  patch: Partial<Pick<SessionRecord, "durationMs" | "completed" | "feedback" | "soundLevel" | "hapticsOn" | "interactions">>,
) {
  const log = readSessionLog();
  const next = log.map((row) => (row.id === sessionId ? { ...row, ...patch } : row));
  writeSessionLog(next);
}

export function clearActiveSession() {
  writeJson(ACTIVE_SESSION_KEY, null);
}

export function setSessionFeedback(sessionId: string, feedback: SessionFeedback) {
  patchSessionRecord(sessionId, { feedback });
  clearActiveSession();
}

export function getSessionHistoryForRecommend(): SessionRecord[] {
  return readSessionLog();
}

export function getExperienceFeedbackBias(id: string): SessionFeedback | null {
  const rows = readSessionLog().filter((r) => r.experienceId === id && r.feedback);
  if (rows.length === 0) return null;
  const scores = { better: 0, same: 0, worse: 0 };
  for (const row of rows) {
    if (row.feedback) scores[row.feedback] += 1;
  }
  if (scores.better >= scores.worse && scores.better >= scores.same) return "better";
  if (scores.worse > scores.better) return "worse";
  return "same";
}

export function getRecentMetaTimestamps(): Record<string, number> {
  const profile = getProfile();
  const out: Record<string, number> = {};
  for (const [id, stats] of Object.entries(profile.experiences)) {
    if (stats.lastPlayed) out[id] = stats.lastPlayed;
  }
  return out;
}

function affinityScore(id: string, favourite: boolean): number {
  const stats = getProfile().experiences[id];
  if (!stats) return 0;
  const ageDays = Math.max(0, (Date.now() - stats.lastPlayed) / 86_400_000);
  const recency = Math.exp(-ageDays / 10);
  const interaction = Math.log1p(stats.pointerDowns + stats.dragPx / 120);
  return (stats.seconds * (1 + interaction * 0.35) + stats.opens * 2) * recency * (favourite ? 1.4 : 1);
}

/** Real habit — not a single open. Used before claiming “for you” / “keep coming back”. */
export function hasStrongAffinity(id: string): boolean {
  const stats = getProfile().experiences[id];
  if (!stats) return false;
  return stats.opens >= 3 && stats.seconds >= 45;
}

export function topAffinityIds(limit = 4): string[] {
  const favs = new Set(getFavourites());
  return Object.keys(getProfile().experiences)
    .filter((id) => hasStrongAffinity(id))
    .map((id) => ({ id, score: affinityScore(id, favs.has(id)) }))
    .filter((row) => row.score > 20)
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
