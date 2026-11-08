import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-24 text-center">
      <Link href="/" aria-label="Prism Pass home" className="rounded-lg">
        <BrandLogo size={38} />
      </Link>
      <p className="mt-12 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">404</p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Not found</h1>
      <p className="mt-3 max-w-sm text-pretty text-sm text-muted-foreground">
        This route does not exist in Prism Pass foundation.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
      >
        Home <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </main>
  );
}
