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
      return;
    }
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const [last] = getRecents();
    if (last) {
      router.replace(`${base}/playground/${last}/`);
      return;
    }
    router.replace(`${base}/playground/`);
  }, [router]);

  return null;
}
