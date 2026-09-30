"use client";

import { useEffect, useRef, useState } from "react";
import { playUiClick } from "@/components/SiteAudio";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
};

function alreadyInstalled() {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  const ios = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return standalone || ios;
}

function homeHint() {
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return "In Safari, tap Share, then Add to Home Screen.";
  return "Open the browser menu and choose Install or Add to Home Screen.";
}

/** Quiet control that installs the app, or explains the browser's own add-to-home step. */
export function AddToHome() {
  const promptRef = useRef<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (alreadyInstalled()) {
      setInstalled(true);
      return;
    }
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register(`${base}/sw.js`).catch(() => {});
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as InstallPrompt;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (installed) return null;

  return (
    <span className="add-home">
      <button
        type="button"
        className="favourites-link"
        onClick={() => {
          playUiClick();
          const prompt = promptRef.current;
          if (prompt) {
            promptRef.current = null;
            void prompt.prompt();
            setHint(null);
            return;
          }
          setHint(homeHint());
        }}
      >
        Add to home
      </button>
      {hint && <span className="add-home__hint">{hint}</span>}
    </span>
  );
}
