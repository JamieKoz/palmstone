import { CATALOG, getMeta } from "./catalog";
import type { Need } from "./needs";
import {
  getExperienceFeedbackBias,
  getFavourites,
  getLastNeed,
  getRecents,
  getSessionHistoryForRecommend,
  hasStrongAffinity,
  sortByAffinity,
  topAffinityIds,
} from "./storage";
import type { ExperienceId, ExperienceMeta } from "./types";
import { hasWorldState, worldAgeSec } from "./worldState";

const CURATED: Record<Exclude<Need, "explore">, ExperienceId[]> = {
  settle: ["sand-tray", "silk-fluid", "ripple-pool", "stone-polish"],
  focus: ["slider-loom", "silk-fluid", "sand-tray", "elastic-web"],
  stimulate: ["keyboard-thock", "gear-mesh", "bubble-wrap", "pulse-pads"],
  hands: ["pen-clicker", "zipper", "fidget-spinner", "mouse-click"],
  worlds: ["mesh-lattice", "infinite-garden", "infinite-sand", "infinite-water"],
};

function matchesNeed(meta: ExperienceMeta, need: Need): boolean {
  if (need === "explore") return true;
  return meta.needs.includes(need);
}

function feedbackBoost(id: string): number {
  const bias = getExperienceFeedbackBias(id);
  if (bias === "better") return 12;
  if (bias === "worse") return -18;
  return 0;
}

function hourBoost(id: string, need: Need | null): number {
  if (!need || need === "explore") return 0;
  const hour = new Date().getHours();
  const history = getSessionHistoryForRecommend();
  let score = 0;
  for (const row of history) {
    if (row.experienceId !== id || row.need !== need) continue;
    const delta = Math.abs(row.hour - hour);
    if (delta <= 2 || delta >= 22) score += 4;
  }
  return score;
}

function worldBoost(id: string): number {
  if (!hasWorldState(id)) return 0;
  const age = worldAgeSec(id);
  if (age == null) return 0;
  if (age > 600) return 8;
  if (age > 60) return 4;
  return 2;
}

function sensoryOverlap(a: ExperienceMeta, b: ExperienceMeta): number {
  let n = 0;
  if (a.layer === b.layer) n += 1;
  if (a.speed === b.speed) n += 1;
  if (a.cognitive === b.cognitive) n += 1;
  if (a.sensory.haptic === b.sensory.haptic && a.sensory.audio === b.sensory.audio) n += 1;
  return n;
}

function scoreForNeed(meta: ExperienceMeta, need: Need, varietyExclude?: string): number {
  const favs = new Set(getFavourites());
  const recents = getRecents();
  let score = 0;

  if (matchesNeed(meta, need)) score += 20;

  const curated = need !== "explore" ? CURATED[need] : [];
  const curatedIndex = curated.indexOf(meta.id);
  if (curatedIndex >= 0) score += 8 - curatedIndex;

  if (favs.has(meta.id)) score += 6;
  score += feedbackBoost(meta.id);
  score += hourBoost(meta.id, need === "explore" ? getLastNeed() : need);
  score += worldBoost(meta.id);

  const affinityOrder = sortByAffinity(CATALOG);
  const affinityRank = affinityOrder.findIndex((e) => e.id === meta.id);
  if (affinityRank >= 0 && hasStrongAffinity(meta.id)) {
    score += Math.max(0, 10 - affinityRank * 2);
  }

  if (varietyExclude && meta.id === varietyExclude) score -= 15;
  const recentIndex = recents.indexOf(meta.id);
  if (recentIndex === 0 && need !== "explore") score -= 4;

  return score;
}

export function recommendForNeed(need: Need, limit = 4, varietyExclude?: string): ExperienceMeta[] {
  if (need === "explore") {
    return sortByAffinity(CATALOG).slice(0, limit);
  }

  const ranked = CATALOG.map((meta) => ({
    meta,
    score: scoreForNeed(meta, need, varietyExclude),
  }))
    .filter((row) => matchesNeed(row.meta, need) || row.score > 8)
    .sort((a, b) => b.score - a.score);

  const picked: ExperienceMeta[] = [];
  for (const row of ranked) {
    if (picked.length >= limit) break;
    if (picked.some((p) => p.id === row.meta.id)) continue;
    if (!matchesNeed(row.meta, need) && picked.length > 0) continue;
    const tooSimilar = picked.some((p) => sensoryOverlap(p, row.meta) >= 3);
    if (tooSimilar && picked.length < limit - 1 && ranked.length > limit) continue;
    picked.push(row.meta);
  }

  if (picked.length < limit) {
    for (const row of ranked) {
      if (picked.length >= limit) break;
      if (picked.some((p) => p.id === row.meta.id)) continue;
      if (!matchesNeed(row.meta, need)) continue;
      picked.push(row.meta);
    }
  }

  if (picked.length < limit) {
    for (const id of CURATED[need]) {
      if (picked.length >= limit) break;
      if (picked.some((p) => p.id === id)) continue;
      const meta = getMeta(id);
      if (meta) picked.push(meta);
    }
  }

  return picked.slice(0, limit);
}

/** Remaining experiences that match this mood, ranked after the shortlist. */
export function moreForNeed(need: Need, featured: ExperienceMeta[]): ExperienceMeta[] {
  if (need === "explore") return [];
  const taken = new Set(featured.map((row) => row.id));
  return CATALOG.filter((meta) => matchesNeed(meta, need) && !taken.has(meta.id)).sort(
    (a, b) => scoreForNeed(b, need) - scoreForNeed(a, need),
  );
}

export function topRecommendation(need: Need, varietyExclude?: string): ExperienceMeta | undefined {
  return recommendForNeed(need, 1, varietyExclude)[0];
}

/** Only surfaces when habit signal is real — otherwise empty. */
export function recommendForYou(limit = 3): ExperienceMeta[] {
  const ids = topAffinityIds(limit + 2);
  if (ids.length === 0) return [];

  const out: ExperienceMeta[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    const meta = getMeta(id);
    if (!meta) continue;
    seen.add(id);
    out.push(meta);
    if (out.length >= limit) break;
  }
  return out;
}

export function suggestOnLanding(): ExperienceMeta | undefined {
  const affinity = topAffinityIds(1)[0];
  if (affinity) return getMeta(affinity);
  const last = getLastNeed();
  if (last && last !== "explore") {
    const top = topRecommendation(last);
    if (top) return top;
  }
  return getMeta("mesh-lattice") ?? CATALOG[0];
}

export type ReturnCue = {
  line: string;
  experienceId?: ExperienceId;
};

/** A reason to come back — never a streak, never a score. */
export function getReturnCue(): ReturnCue | null {
  const growing = (
    [
      ["infinite-garden", "Something in the garden has changed."],
      ["infinite-sand", "The dunes are still as you left them."],
      ["infinite-marble", "The run is still there."],
      ["infinite-water", "Rain is still on the glass."],
    ] as const
  ).find(([id]) => {
    const age = worldAgeSec(id);
    return age != null && age > 90;
  });
  if (growing) {
    return { line: growing[1], experienceId: growing[0] };
  }

  const hour = new Date().getHours();
  const history = getSessionHistoryForRecommend().filter((row) => {
    const delta = Math.abs(row.hour - hour);
    return (delta <= 1 || delta >= 23) && row.durationMs > 20_000;
  });
  const counts = new Map<string, number>();
  for (const row of history) {
    counts.set(row.experienceId, (counts.get(row.experienceId) ?? 0) + 1);
  }
  let bestId = "";
  let bestN = 0;
  for (const [id, n] of counts) {
    if (n > bestN) {
      bestId = id;
      bestN = n;
    }
  }
  if (bestN >= 2) {
    const meta = getMeta(bestId);
    if (meta) {
      return { line: `Around now you usually reach for ${meta.name}.`, experienceId: meta.id };
    }
  }

  const recents = getRecents();
  if (recents[0]) {
    const meta = getMeta(recents[0]);
    if (meta) return { line: `${meta.name} is still here.`, experienceId: meta.id };
  }

  return { line: "Pick a song. The lattice will follow.", experienceId: "mesh-lattice" };
}
