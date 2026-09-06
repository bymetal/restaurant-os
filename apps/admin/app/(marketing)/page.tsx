import { FeatureShowcase } from "./_components/FeatureShowcase";
import { Hero } from "./_components/Hero";
import { MarketingNav } from "./_components/MarketingNav";
import { Pricing } from "./_components/Pricing";
import { ProcessSteps } from "./_components/ProcessSteps";

export default function LandingPage() {
  return (
    <>
      <MarketingNav />
      <main id="urun">
        <Hero />
        <ProcessSteps />
        <FeatureShowcase />
        <Pricing />
      </main>
    </>
  );
}
