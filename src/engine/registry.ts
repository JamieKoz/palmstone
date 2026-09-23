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
import { meshLattice } from "@/experiences/mesh-lattice";
import { auroraVeil } from "@/experiences/aurora-veil";

/** Client-only module registry. */
const MODULES: ExperienceModule[] = [
  meshLattice,
  auroraVeil,
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
