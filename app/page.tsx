import { SiteNav } from "@/components/marketing/site-nav";
import { Hero } from "@/components/marketing/hero";
import { Audiences, Features, HowItWorks } from "@/components/marketing/features";
import { CtaBand, Faq, MetricsBand } from "@/components/marketing/closing";
import { SiteFooter } from "@/components/marketing/site-footer";

export const metadata = {
  title: "Prism Pass — Unified attendance + verification",
  description:
    "One people directory, one verifiable QR identity pass, and one canonical attendance engine — scoped to your organization and verified on the server. Powered by Syntaxure Labs.",
};

/** Public marketing front for Prism Pass. */
export default function Home() {
  return (
    <div className="min-h-dvh bg-background">
      <SiteNav />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <MetricsBand />
        <Audiences />
        <Faq />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}
