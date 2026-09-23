import Link from "next/link";

export default function HomePage() {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="atmosphere" aria-hidden />
      <div className="grain-overlay" aria-hidden />

      {/* Full-bleed atmospheric plane with soft stone orb as visual anchor */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
        <div
          className="hero-mark h-[min(70vw,420px)] w-[min(70vw,420px)] rounded-full"
          style={{
            background:
              "radial-gradient(circle at 35% 30%, #c4b49a 0%, #7a6e5c 28%, #3a4038 58%, transparent 72%)",
            filter: "blur(2px)",
          }}
        />
      </div>

      <div className="relative z-10 flex flex-1 flex-col justify-end px-6 pb-16 pt-24 sm:px-10 sm:pb-20 lg:justify-center lg:pb-24">
        <div className="hero-motion mx-auto w-full max-w-2xl lg:mx-0 lg:max-w-xl">
          <h1 className="font-[family-name:var(--font-display)] text-[clamp(3.25rem,12vw,5.5rem)] leading-[0.95] tracking-tight text-[var(--ink)]">
            Palmstone
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-[var(--mist)] sm:text-xl">
            Ridiculously satisfying interactions for when you need to settle, focus, or just feel
            something.
          </p>
          <div className="hero-cta mt-10">
            <Link
              href="/playground"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--jade)] px-7 py-3.5 text-base font-medium text-[var(--bg)] transition hover:brightness-110 active:scale-[0.98]"
            >
              Enter playground
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
