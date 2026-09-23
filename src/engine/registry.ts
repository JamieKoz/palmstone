import type { ExperienceId, ExperienceModule } from "./types";
import { sandTray } from "@/experiences/sand-tray";
import { silkFluid } from "@/experiences/silk-fluid";
import { magneticField } from "@/experiences/magnetic-field";
import { gearMesh } from "@/experiences/gear-mesh";
import { orbitBeads } from "@/experiences/orbit-beads";
import { elasticWeb } from "@/experiences/elastic-web";
import { pulsePads } from "@/experiences/pulse-pads";
import { stonePolish } from "@/experiences/stone-polish";
import { ripplePool } from "@/experiences/ripple-pool";
import { sliderLoom } from "@/experiences/slider-loom";

/** Client-only module registry (Pixi-backed). */
const MODULES: ExperienceModule[] = [
  sandTray,
  silkFluid,
  ripplePool,
  elasticWeb,
  magneticField,
  gearMesh,
  orbitBeads,
  pulsePads,
  stonePolish,
  sliderLoom,
];

export function getExperienceModule(id: ExperienceId | string): ExperienceModule | undefined {
  return MODULES.find((e) => e.id === id);
}
