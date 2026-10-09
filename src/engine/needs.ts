export type Need = "settle" | "focus" | "stimulate" | "hands" | "worlds" | "explore";

export const NEEDS: Need[] = ["settle", "focus", "stimulate", "hands", "worlds", "explore"];

export const NEED_LABELS: Record<Need, string> = {
  settle: "Settle",
  focus: "Focus",
  stimulate: "Stimulate",
  hands: "Hands busy",
  worlds: "Worlds",
  explore: "Explore",
};

/** Default timed session length (minutes) when starting from a need. */
export const NEED_DEFAULT_MINUTES: Record<Exclude<Need, "explore">, number> = {
  settle: 5,
  focus: 10,
  stimulate: 2,
  hands: 5,
  worlds: 15,
};

export const TIMER_PRESETS = [
  { minutes: 2, label: "Quick reset" },
  { minutes: 5, label: "Settle" },
  { minutes: 10, label: "Focus" },
  { minutes: 15, label: "Keep going" },
  { minutes: 20, label: "Deep calm" },
] as const;

export function parseNeed(raw: string | null | undefined): Need | null {
  if (!raw || raw === "ask") return null;
  if (NEEDS.includes(raw as Need)) return raw as Need;
  return null;
}

export function needLabel(need: Need): string {
  return NEED_LABELS[need];
}
