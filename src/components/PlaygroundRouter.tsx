"use client";

import { NeedPicker } from "@/components/NeedPicker";
import { NeedShortlist } from "@/components/NeedShortlist";
import { PlaygroundGallery } from "@/components/PlaygroundGallery";
import { PlaygroundShell } from "@/components/PlaygroundShell";
import { useBrowserSearchParams } from "@/components/useBrowserSearchParams";
import { parseNeed } from "@/engine/needs";

/**
 * Static export pre-renders `/playground/` once. Query routes (`?need=…`) only
 * exist in the browser — read them from the URL after paint, never via
 * `useSearchParams()` (that hook suspends forever on exported HTML).
 */
export function PlaygroundRouter() {
  const params = useBrowserSearchParams();
  const needRaw = params.get("need");
  const need = parseNeed(needRaw);

  if (needRaw === "ask") {
    return (
      <PlaygroundShell>
        <NeedPicker />
      </PlaygroundShell>
    );
  }

  if (need && need !== "explore") {
    return (
      <PlaygroundShell>
        <NeedShortlist need={need} />
      </PlaygroundShell>
    );
  }

  return <PlaygroundGallery />;
}
