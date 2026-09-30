import { TRAY_GROUPS, experiencesInGroup } from "@/engine/catalog";
import type { ExperienceMeta } from "@/engine/types";

/** Vertical field of view shared with the picker camera. */
export const NAV_FOV = (52 * Math.PI) / 180;
/** How far the camera stands in front of the focused stone. */
export const NAV_STAND = 3.2;

export type NavAction =
  | { type: "foyer" }
  | { type: "group"; groupId: string }
  | { type: "favourites" }
  | { type: "experience"; id: string };

export type NavPanelSpec = {
  key: string;
  title: string;
  subtitle: string;
  kicker: string;
  accent: string;
  position: [number, number, number];
  width: number;
  height: number;
  action: NavAction;
};

export type NavPlace =
  | { kind: "foyer" }
  | { kind: "group"; groupId: string }
  | { kind: "favourites" };

type Slot = {
  key: string;
  title: string;
  subtitle: string;
  kicker: string;
  accent: string;
  action: NavAction;
  emphasis?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Stones in one row. The camera slides along the row and always faces the
 * focused stone, so neighbours peek in at the edges.
 */
export function layoutPanels(
  place: NavPlace,
  aspect: number,
  favourites: ExperienceMeta[],
  roomItems: ExperienceMeta[],
): NavPanelSpec[] {
  if (place.kind === "foyer") return layoutFoyer(aspect, favourites.length > 0);
  return layoutRoom(aspect, roomItems);
}

function layoutFoyer(aspect: number, hasFavourites: boolean): NavPanelSpec[] {
  const slots: Slot[] = TRAY_GROUPS.map((group) => ({
    key: `group:${group.id}`,
    title: group.name,
    subtitle: `${group.ids.length} stones`,
    kicker: "Tray",
    accent: "#7f9e88",
    action: { type: "group", groupId: group.id } as NavAction,
  }));
  if (hasFavourites) {
    slots.push({
      key: "favourites",
      title: "Favourites",
      subtitle: "Kept close",
      kicker: "Yours",
      accent: "#c9a66b",
      action: { type: "favourites" },
    });
  }

  return railLayout(slots, aspect);
}

function layoutRoom(aspect: number, items: ExperienceMeta[]): NavPanelSpec[] {
  const slots: Slot[] = items.map((exp) => ({
    key: exp.id,
    title: exp.name,
    subtitle: exp.tagline,
    kicker: exp.modality,
    accent: exp.accent,
    action: { type: "experience", id: exp.id },
  }));
  slots.push({
    key: "back",
    title: "Back",
    subtitle: "Return to the foyer",
    kicker: "Step out",
    accent: "#8a8070",
    action: { type: "foyer" },
  });

  return railLayout(slots, aspect);
}

function viewHalf(distance: number, aspect: number) {
  const halfH = distance * Math.tan(NAV_FOV / 2);
  const halfW = halfH * Math.max(aspect, 0.4);
  return { halfW, halfH };
}

/** One row at eye level. The exit stone, when there is one, sits at the left end. */
function railLayout(slots: Slot[], aspect: number): NavPanelSpec[] {
  const back = slots.filter((slot) => slot.action.type === "foyer");
  const rest = slots.filter((slot) => slot.action.type !== "foyer");
  const body = rest.slice();
  const heroAt = body.findIndex((slot) => slot.emphasis);
  const hero = heroAt >= 0 ? body[heroAt] : undefined;
  if (hero) {
    body.splice(heroAt, 1);
    body.splice(Math.floor(body.length / 2), 0, hero);
  }
  const line = [...back, ...body];
  if (line.length === 0) return [];

  const { halfW } = viewHalf(NAV_STAND, aspect);
  const gap = clamp(halfW * 0.1, 0.14, 0.42);
  const width = clamp(Math.min(halfW * 1.2, halfW * 1.45 - gap * 2), 0.9, 1.85);
  const height = clamp(width * 0.66, 0.64, 1.18);
  const step = width + gap;
  const depth = -3.9;
  const mid = (line.length - 1) / 2;

  return line.map((slot, i) => {
    const along = i - mid;
    return {
      ...slot,
      position: [along * step, 0, depth - Math.abs(along) * 0.05],
      width: slot.action.type === "foyer" ? width * 0.86 : width,
      height: slot.action.type === "foyer" ? height * 0.78 : height,
    };
  });
}

export function roomItemsFor(
  place: NavPlace,
  favourites: ExperienceMeta[],
  ordered: (items: ExperienceMeta[]) => ExperienceMeta[],
): ExperienceMeta[] {
  if (place.kind === "favourites") return ordered(favourites);
  if (place.kind === "group") {
    const group = TRAY_GROUPS.find((item) => item.id === place.groupId);
    return group ? ordered(experiencesInGroup(group)) : [];
  }
  return [];
}

export function placeLabel(place: NavPlace): string {
  if (place.kind === "favourites") return "Favourites";
  if (place.kind === "group") {
    return TRAY_GROUPS.find((item) => item.id === place.groupId)?.name ?? "Tray";
  }
  return "Playground";
}
