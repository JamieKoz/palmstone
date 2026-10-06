"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getRecents } from "@/engine/storage";

/** When installed as PWA, skip the marketing landing and open the tray — or last stone. */
export function StandaloneEntry() {
  const router = useRouter();

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone;
    if (!standalone) return;
    if (window.location.pathname !== "/" && !window.location.pathname.endsWith("/index.html")) {
      // Also allow basePath-rooted index when deployed under /palmstone/
      const path = window.location.pathname.replace(/\/$/, "");
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      if (path !== "" && path !== base) return;
    }
    const [last] = getRecents();
    if (last) {
      router.replace(`/playground/${last}/`);
      return;
    }
    router.replace("/playground/");
  }, [router]);

  return null;
}
