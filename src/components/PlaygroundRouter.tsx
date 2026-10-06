"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { NeedPicker } from "@/components/NeedPicker";
import { NeedShortlist } from "@/components/NeedShortlist";
import { PlaygroundGallery } from "@/components/PlaygroundGallery";
import { PlaygroundShell } from "@/components/PlaygroundShell";
import { parseNeed } from "@/engine/needs";

/**
 * Static export pre-renders `/playground/` once. Query routes (`?need=…`) only
 * exist in the browser. Suspense + useSearchParams means the server HTML is the
 * fallback — first client paint must match it, then we route after mount.
 */
function PlaygroundRouterInner() {
  const params = useSearchParams();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <PlaygroundRouteFallback />;
  }

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

function PlaygroundRouteFallback() {
  return (
    <div className="relative min-h-dvh">
      <div className="atmosphere" aria-hidden />
      <div className="grain-overlay" aria-hidden />
    </div>
  );
}

export function PlaygroundRouter() {
  return (
    <Suspense fallback={<PlaygroundRouteFallback />}>
      <PlaygroundRouterInner />
    </Suspense>
  );
}
