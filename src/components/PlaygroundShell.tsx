"use client";

import Link from "next/link";
import { playUiClick } from "@/components/SiteAudio";
import { MusicWaveToggle } from "@/components/MusicWaveToggle";
import { SfxToggle } from "@/components/SfxToggle";
import { PageRevealWipe } from "@/components/PageRevealWipe";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export function PlaygroundShell({ children }: Props) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <PageRevealWipe />
      <div className="atmosphere" aria-hidden />
      <div className="grain-overlay" aria-hidden />
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col px-4 pb-[max(5.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-8 sm:pt-12">
        <header className="gallery-header shell-header">
          <Link href="/" onClick={() => playUiClick()} className="gallery-header__brand">
            <span className="polished-orb header-mark" aria-hidden />
            Palmstone
          </Link>
          <div className="shell-header__top">
            <Link href="/" onClick={() => playUiClick()} className="nav-home">
              Home
            </Link>
            <div className="gallery-audio">
              <MusicWaveToggle className="sound-wave-btn--gallery" />
              <SfxToggle />
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
