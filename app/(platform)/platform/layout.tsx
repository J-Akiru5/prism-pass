import Link from "next/link";
import { PrismPassLogo } from "@/components/brand/prism-pass-logo";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Prism Pass home" className="rounded-lg">
            <PrismPassLogo size={30} />
          </Link>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
            Platform
          </span>
          <nav aria-label="Platform" className="ml-auto flex items-center gap-1 text-sm text-muted-foreground">
            <Link href="/platform" className="rounded-lg px-3 py-2 font-medium transition-colors hover:bg-muted hover:text-foreground">
              Overview
            </Link>
            <Link href="/consoles" className="rounded-lg px-3 py-2 font-medium transition-colors hover:bg-muted hover:text-foreground">
              Consoles
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
