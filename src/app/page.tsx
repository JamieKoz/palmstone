import { LandingCTA } from "@/components/LandingCTA";
import { LandingShowcase } from "@/components/LandingShowcase";
import { StandaloneEntry } from "@/components/StandaloneEntry";

export default function HomePage() {
  return (
    <main className="landing-page relative">
      <StandaloneEntry />
      <div className="atmosphere" aria-hidden />
      <div className="grain-overlay" aria-hidden />

      <section className="landing-hero" aria-label="Palmstone">
        <div className="landing-hero__orb" aria-hidden>
          <div className="hero-mark polished-orb">
            <span className="hero-mark__spin" />
          </div>
        </div>

        <div className="landing-hero__copy">
          <h1 className="landing-hero__title">Palmstone</h1>
          <p className="landing-hero__line">Something to do with your hands.</p>
          <LandingCTA />
        </div>

        <div id="on-the-tray" className="landing-hero__tray">
          <LandingShowcase />
        </div>
      </section>
    </main>
  );
}
