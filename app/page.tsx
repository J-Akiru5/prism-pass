import { SiteNav } from "@/components/marketing/site-nav";
import { Hero } from "@/components/marketing/hero";
import { Audiences, Features, HowItWorks } from "@/components/marketing/features";
import { CtaBand, Faq, MetricsBand } from "@/components/marketing/closing";
import { SiteFooter } from "@/components/marketing/site-footer";

export const metadata = {
  title: "Unified attendance + verification",
  description:
    "One people directory, one QR pass per person, and one attendance record your office can verify. Powered by Syntaxure Labs.",
  openGraph: {
    title: "Prism Pass — Attendance you can prove, not just record",
    description:
      "One people directory, one QR pass per person, and one attendance record your office can verify.",
    url: "/",
  },
};

/** Public marketing front for Prism Pass. */
export default function Home() {
  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-[250%] rounded-lg bg-card px-4 py-2.5 text-sm font-bold text-primary shadow-lg transition-transform focus-visible:translate-y-0"
      >
        Skip to content
      </a>
      <SiteNav />
      <main id="main-content" tabIndex={-1}>
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
