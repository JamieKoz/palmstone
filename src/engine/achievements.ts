import { CATALOG, signatureExperiences } from "@/engine/catalog";
import { getSharedAudio } from "@/engine/audio";
import { fireHaptic } from "@/engine/haptics";
import {
  experienceStatList,
  getAchievements,
  getFavourites,
  getHapticsPref,
  setAchievements,
} from "@/engine/storage";
import type { ExperienceId } from "@/engine/types";

export type Achievement = {
  id: string;
  name: string;
  detail: string;
  /** Where to try it. Omitted when it can happen in any experience. */
  experienceId?: ExperienceId;
};

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "spinner-coast",
    name: "Long spin",
    detail: "Keep the fidget spinner turning for 20 seconds after one flick.",
    experienceId: "fidget-spinner",
  },
  {
    id: "spinner-fifteen",
    name: "Longer spin",
    detail: "Keep the fidget spinner turning for 45 seconds after one flick.",
    experienceId: "fidget-spinner",
  },
  {
    id: "spinner-flicks",
    name: "Flicker fingers",
    detail: "Flick the fidget spinner 25 times in one visit.",
    experienceId: "fidget-spinner",
  },
  {
    id: "spinner-minute",
    name: "Unstoppable",
    detail: "Keep the fidget spinner turning for 90 seconds after one flick.",
    experienceId: "fidget-spinner",
  },
  {
    id: "spinner-storm",
    name: "Storm of flicks",
    detail: "Flick the fidget spinner 60 times in one visit.",
    experienceId: "fidget-spinner",
  },
  {
    id: "bubble-sheet",
    name: "Clean sheet",
    detail: "Pop every blister on a sheet of bubble wrap.",
    experienceId: "bubble-wrap",
  },
  {
    id: "bubble-three",
    name: "Three sheets",
    detail: "Clear eight sheets of bubble wrap in one visit.",
    experienceId: "bubble-wrap",
  },
  {
    id: "bubble-fifteen",
    name: "Warehouse",
    detail: "Clear 15 sheets of bubble wrap in one visit.",
    experienceId: "bubble-wrap",
  },
  {
    id: "elastic-yank",
    name: "Hard pull",
    detail: "Yank a node on the elastic web out to a long stretch.",
    experienceId: "elastic-web",
  },
  {
    id: "elastic-five",
    name: "Five yanks",
    detail: "Give the elastic web 15 hard pulls in one visit.",
    experienceId: "elastic-web",
  },
  {
    id: "elastic-thirty",
    name: "Never settles",
    detail: "Give the elastic web 30 hard pulls in one visit.",
    experienceId: "elastic-web",
  },
  {
    id: "orbit-crowd",
    name: "Full ring",
    detail: "Have ten beads orbiting at the same time.",
    experienceId: "orbit-beads",
  },
  {
    id: "orbit-dozen",
    name: "Busy sky",
    detail: "Have eighteen beads orbiting at the same time.",
    experienceId: "orbit-beads",
  },
  {
    id: "orbit-dwell",
    name: "Staying in orbit",
    detail: "Keep at least one bead orbiting for 90 seconds.",
    experienceId: "orbit-beads",
  },
  {
    id: "orbit-watch",
    name: "Watched sky",
    detail: "Keep at least one bead orbiting for 3 minutes.",
    experienceId: "orbit-beads",
  },
  {
    id: "pen-habit",
    name: "Click habit",
    detail: "Click the pen 40 times in one visit.",
    experienceId: "pen-clicker",
  },
  {
    id: "pen-fifty",
    name: "Fifty clicks",
    detail: "Click the pen 200 times.",
    experienceId: "pen-clicker",
  },
  {
    id: "pen-century",
    name: "Hundred clicks",
    detail: "Click the pen 500 times.",
    experienceId: "pen-clicker",
  },
  {
    id: "pen-thousand",
    name: "Can't put it down",
    detail: "Click the pen 1,000 times.",
    experienceId: "pen-clicker",
  },
  {
    id: "pen-session",
    name: "One sitting",
    detail: "Click the pen 100 times without leaving.",
    experienceId: "pen-clicker",
  },
  {
    id: "zipper-run",
    name: "End to end",
    detail: "Pull the zipper from one end to the other in a single drag.",
    experienceId: "zipper",
  },
  {
    id: "zipper-twice",
    name: "There and back",
    detail: "Zip end to end six times in one visit.",
    experienceId: "zipper",
  },
  {
    id: "zipper-dozen",
    name: "Worn track",
    detail: "Zip end to end 12 times in one visit.",
    experienceId: "zipper",
  },
  {
    id: "switch-run",
    name: "Flicker",
    detail: "Flip the light switch 15 times in one visit.",
    experienceId: "light-switch",
  },
  {
    id: "switch-twenty",
    name: "Restless switch",
    detail: "Flip the light switch 100 times.",
    experienceId: "light-switch",
  },
  {
    id: "switch-session",
    name: "Hallway light",
    detail: "Flip the light switch 40 times in one visit.",
    experienceId: "light-switch",
  },
  {
    id: "switch-endless",
    name: "Never dark",
    detail: "Flip the light switch 200 times.",
    experienceId: "light-switch",
  },
  {
    id: "lamp-eight",
    name: "Cord worn in",
    detail: "Pull the lamp cord until it snaps 30 times.",
    experienceId: "lamp-toggle",
  },
  {
    id: "lamp-marathon",
    name: "Worn cord",
    detail: "Pull the lamp cord until it snaps 80 times.",
    experienceId: "lamp-toggle",
  },
  {
    id: "keys-forty",
    name: "Forty keys",
    detail: "Press 150 keys.",
    experienceId: "keyboard-thock",
  },
  {
    id: "keys-spread",
    name: "Across the board",
    detail: "Press 18 different keys in one visit.",
    experienceId: "keyboard-thock",
  },
  {
    id: "keys-flood",
    name: "Flood of keys",
    detail: "Press 400 keys.",
    experienceId: "keyboard-thock",
  },
  {
    id: "keys-alphabet",
    name: "Whole alphabet",
    detail: "Press every letter key in one visit.",
    experienceId: "keyboard-thock",
  },
  {
    id: "button-dozen",
    name: "Dozen thumps",
    detail: "Press the big button 40 times.",
    experienceId: "big-button",
  },
  {
    id: "button-hundred",
    name: "Heavy thumb",
    detail: "Press the big button 100 times.",
    experienceId: "big-button",
  },
  {
    id: "mouse-all",
    name: "Three buttons",
    detail: "Click the left button, the right button, and the wheel.",
    experienceId: "mouse-click",
  },
  {
    id: "mouse-many",
    name: "Desk workout",
    detail: "Click the mouse 40 times.",
    experienceId: "mouse-click",
  },
  {
    id: "pads-all",
    name: "Every pad",
    detail: "Tap every pulse pad.",
    experienceId: "pulse-pads",
  },
  {
    id: "pads-session",
    name: "Drum circle",
    detail: "Hit the pulse pads 80 times in one visit.",
    experienceId: "pulse-pads",
  },
  {
    id: "cube-tour",
    name: "All six faces",
    detail: "Turn the fidget cube through every face.",
    experienceId: "fidget-cube",
  },
  {
    id: "cube-fidget",
    name: "All afternoon",
    detail: "Play the fidget cube faces 40 times in one visit.",
    experienceId: "fidget-cube",
  },
  {
    id: "gear-coast",
    name: "Still meshing",
    detail: "Let the gears keep turning for 12 seconds after you let go.",
    experienceId: "gear-mesh",
  },
  {
    id: "gear-long",
    name: "Long mesh",
    detail: "Let the gears keep turning for 25 seconds after you let go.",
    experienceId: "gear-mesh",
  },
  {
    id: "loom-cross",
    name: "Full pass",
    detail: "Drag the shuttle across the loom in one pull.",
    experienceId: "slider-loom",
  },
  {
    id: "sand-rake",
    name: "Long rake",
    detail: "Rake a long path through the sand tray.",
    experienceId: "sand-tray",
  },
  {
    id: "ripple-wake",
    name: "Long wake",
    detail: "Drag a long path across the ripple pool.",
    experienceId: "ripple-pool",
  },
  {
    id: "silk-swirl",
    name: "Long swirl",
    detail: "Drag a long path through the silk fluid.",
    experienceId: "silk-fluid",
  },
  {
    id: "magnet-stir",
    name: "Stirred field",
    detail: "Drag a long path through the magnetic field.",
    experienceId: "magnetic-field",
  },
  {
    id: "lattice-orbit",
    name: "Around the lattice",
    detail: "Drag a long orbit around the mesh lattice.",
    experienceId: "mesh-lattice",
  },
  {
    id: "ten-minutes",
    name: "Ten minutes",
    detail: "Spend 10 minutes inside one experience.",
  },
  {
    id: "half-hour-sit",
    name: "Half an hour",
    detail: "Spend 30 minutes inside one experience.",
  },
  {
    id: "devotee",
    name: "Devotee",
    detail: "Open the same experience 20 times.",
  },
  {
    id: "signature-kept",
    name: "Signature kept",
    detail: "Favourite every Signature experience.",
  },
  {
    id: "curious",
    name: "Curious",
    detail: "Open eight different experiences.",
  },
  {
    id: "explorer",
    name: "Explorer",
    detail: "Open sixteen different experiences.",
  },
  {
    id: "everywhere",
    name: "Everywhere",
    detail: "Open every experience at least once.",
  },
  {
    id: "again",
    name: "Back again",
    detail: "Open the same experience six times.",
  },
  {
    id: "familiar",
    name: "Familiar",
    detail: "Open the same experience 15 times.",
  },
  {
    id: "full-minute",
    name: "Three minutes",
    detail: "Spend three minutes inside one experience.",
  },
  {
    id: "quarter-hour",
    name: "An hour",
    detail: "Play for an hour in total.",
  },
  {
    id: "marathon",
    name: "Long sit",
    detail: "Play for five hours in total.",
  },
  {
    id: "hundred-taps",
    name: "Hundreds of taps",
    detail: "Press inside experiences 250 times.",
  },
  {
    id: "thousand-taps",
    name: "Thousand taps",
    detail: "Press inside experiences 5,000 times.",
  },
  {
    id: "ten-thousand-taps",
    name: "Ten thousand taps",
    detail: "Press inside experiences 10,000 times.",
  },
  {
    id: "miles",
    name: "Miles of drag",
    detail: "Drag a long way across experiences, added together.",
  },
  {
    id: "three-stars",
    name: "Three stars",
    detail: "Mark three experiences as favourites.",
  },
  {
    id: "eight-stars",
    name: "Eight stars",
    detail: "Mark twelve experiences as favourites.",
  },
  {
    id: "handful",
    name: "A handful",
    detail: "Earn 10 achievements.",
  },
  {
    id: "cabinet",
    name: "Cabinet",
    detail: "Earn 40 achievements.",
  },
];

type Listener = (achievement: Achievement) => void;

const listeners = new Set<Listener>();
const COUNT_KEY = "palmstone:achCounts";

let counts: Record<string, number> | null = null;
let syncing = false;

function loadCounts() {
  if (counts) return;
  counts = {};
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(COUNT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (parsed && typeof parsed === "object") counts = parsed;
  } catch {
    counts = {};
  }
}

function saveCounts() {
  if (!counts || typeof window === "undefined") return;
  try {
    localStorage.setItem(COUNT_KEY, JSON.stringify(counts));
  } catch {
    /* quota */
  }
}

export function isAchievementUnlocked(id: string) {
  return getAchievements().includes(id);
}

export function subscribeAchievements(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Returns true the first time this achievement is earned. */
export function unlockAchievement(id: string) {
  const found = ACHIEVEMENTS.find((item) => item.id === id);
  if (!found) return false;
  const owned = getAchievements();
  if (owned.includes(id)) return false;
  setAchievements([...owned, id]);
  const audio = getSharedAudio();
  void audio.resume().then(() => audio.rewardChime());
  if (getHapticsPref()) fireHaptic([18, 40, 28]);
  for (const listener of listeners) listener(found);
  syncLifetimeAchievements();
  return true;
}

/** Add to a saved counter and unlock each goal it passes. */
export function countToward(counter: string, steps: { id: string; goal: number }[], by = 1) {
  loadCounts();
  if (!counts) return;
  const next = (counts[counter] ?? 0) + by;
  counts[counter] = next;
  saveCounts();
  for (const step of steps) {
    if (next >= step.goal) unlockAchievement(step.id);
  }
}

let lastSync = 0;

/** Lifetime goals from play time, visits, drags, favourites, and levels. */
export function syncLifetimeAchievements() {
  if (syncing || typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastSync < 1200) return;
  lastSync = now;
  syncing = true;
  try {
    const stats = experienceStatList();
    const opened = stats.filter((row) => row.opens > 0);
    const totalSeconds = stats.reduce((sum, row) => sum + row.seconds, 0);
    const totalDowns = stats.reduce((sum, row) => sum + row.pointerDowns, 0);
    const totalDrag = stats.reduce((sum, row) => sum + row.dragPx, 0);
    const maxOpens = stats.reduce((max, row) => Math.max(max, row.opens), 0);
    const maxSeconds = stats.reduce((max, row) => Math.max(max, row.seconds), 0);
    const dragOf = (id: string) => stats.find((row) => row.id === id)?.dragPx ?? 0;
    const favIds = new Set(getFavourites());
    const signatureIds = signatureExperiences().map((item) => item.id);
    const earned = getAchievements().length;

    if (opened.length >= 8) unlockAchievement("curious");
    if (opened.length >= 16) unlockAchievement("explorer");
    if (opened.length >= CATALOG.length) unlockAchievement("everywhere");
    if (maxOpens >= 6) unlockAchievement("again");
    if (maxOpens >= 15) unlockAchievement("familiar");
    if (maxOpens >= 20) unlockAchievement("devotee");
    if (maxSeconds >= 180) unlockAchievement("full-minute");
    if (maxSeconds >= 600) unlockAchievement("ten-minutes");
    if (maxSeconds >= 1800) unlockAchievement("half-hour-sit");
    if (totalSeconds >= 3600) unlockAchievement("quarter-hour");
    if (totalSeconds >= 5 * 3600) unlockAchievement("marathon");
    if (totalDowns >= 250) unlockAchievement("hundred-taps");
    if (totalDowns >= 5000) unlockAchievement("thousand-taps");
    if (totalDowns >= 10000) unlockAchievement("ten-thousand-taps");
    if (totalDrag >= 150000) unlockAchievement("miles");
    if (favIds.size >= 3) unlockAchievement("three-stars");
    if (favIds.size >= 12) unlockAchievement("eight-stars");
    if (signatureIds.length > 0 && signatureIds.every((id) => favIds.has(id))) {
      unlockAchievement("signature-kept");
    }
    if (dragOf("sand-tray") >= 40000) unlockAchievement("sand-rake");
    if (dragOf("ripple-pool") >= 50000) unlockAchievement("ripple-wake");
    if (dragOf("silk-fluid") >= 50000) unlockAchievement("silk-swirl");
    if (dragOf("magnetic-field") >= 30000) unlockAchievement("magnet-stir");
    if (dragOf("mesh-lattice") >= 40000) unlockAchievement("lattice-orbit");
    if (earned >= 10) unlockAchievement("handful");
    if (earned >= 40) unlockAchievement("cabinet");
  } finally {
    syncing = false;
  }
}
