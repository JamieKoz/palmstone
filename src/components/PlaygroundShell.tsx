"use client";

import Link from "next/link";
import { playUiClick } from "@/components/SiteAudio";
import { SoundLevelToggle } from "@/components/SoundLevelToggle";
import { PageRevealWipe } from "@/components/PageRevealWipe";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export function PlaygroundShell({ children }: Props) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <PageRevealWipe />
      <div className="atmosphere" aria-hidden />
      <div className="grain-overlay" aria-hidden />
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col px-4 pb-[max(5.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-8 sm:pt-12">
        <header className="gallery-header shell-header">
          <Link
            href={`${base}/`}
            onClick={() => playUiClick()}
            className="gallery-header__brand"
          >
            <span className="polished-orb header-mark" aria-hidden />
            Palmstone
          </Link>
          <div className="shell-header__top">
            <Link href={`${base}/`} onClick={() => playUiClick()} className="nav-home">
              Home
            </Link>
            <SoundLevelToggle variant="wave" className="sound-wave-btn--gallery" />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
