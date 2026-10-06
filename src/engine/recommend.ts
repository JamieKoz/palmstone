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

const CURATED: Record<Exclude<Need, "explore">, ExperienceId[]> = {
  settle: ["sand-tray", "silk-fluid", "ripple-pool", "stone-polish", "orbit-beads"],
  focus: ["mesh-lattice", "slider-loom", "silk-fluid", "sand-tray"],
  stimulate: ["keyboard-thock", "fidget-cube", "gear-mesh", "magnetic-field", "bubble-wrap"],
  hands: ["fidget-cube", "zipper", "keyboard-thock", "pulse-pads", "pen-clicker"],
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
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked: ExperienceMeta[] = [];
  for (const row of ranked) {
    if (picked.length >= limit) break;
    if (picked.some((p) => p.id === row.meta.id)) continue;
    picked.push(row.meta);
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
  return getMeta("silk-fluid") ?? CATALOG[0];
}
