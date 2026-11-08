import { SiteNav } from "@/components/marketing/site-nav";
import { Hero } from "@/components/marketing/hero";
import { Audiences, Features, HowItWorks } from "@/components/marketing/features";
import { Accountability, CtaBand, Faq } from "@/components/marketing/closing";
import { ProductShowcase } from "@/components/marketing/product-shots";
import { SiteFooter } from "@/components/marketing/site-footer";

export const metadata = {
  title: "Simple attendance for offices and schools",
  description:
    "One list of people, one QR pass each, and an attendance record your office can show when someone asks. Powered by Syntaxure Labs.",
  openGraph: {
    title: "Prism Pass — Attendance you can prove, not just record",
    description:
      "One list of people, one QR pass each, and an attendance record your office can show when someone asks.",
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
        <ProductShowcase />
        <HowItWorks />
        <Audiences />
        <Accountability />
        <Faq />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}
