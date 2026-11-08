import Link from "next/link";
import { AuthError, ForbiddenError, requirePlatformAdmin } from "@/lib/tenant";
import { BrandLogo } from "@/components/brand/logo";
import { PlatformShell } from "@/components/platform/platform-shell";

// The gate needs cookies, so nothing under /platform is static.
export const dynamic = "force-dynamic";
export const metadata = { title: "Platform console" };

function AccessDenied() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-16">
      <Link href="/" aria-label="Prism Pass home" className="w-fit rounded-lg">
        <BrandLogo size={34} />
      </Link>
      <p className="mt-12 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-gold-dark">
        Platform · Access control
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold leading-tight">Platform access required</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        This console is limited to platform administrators. An organization OWNER — even of every tenant —
        does not get platform access. Ask an existing platform admin for access.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/consoles"
          className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          Back to consoles
        </Link>
        <Link
          href="/login"
          className="inline-flex h-11 items-center rounded-lg border border-input px-5 text-sm font-medium transition hover:bg-muted"
        >
          Sign in with another account
        </Link>
      </div>
    </main>
  );
}

/**
 * Server-side gate for every page in the console.
 *
 * Route handlers re-check `requirePlatformAdmin` independently, so removing a
 * page or hiding a control is never an authorization change. The shell is only
 * mounted for a verified platform admin.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  try {
    await requirePlatformAdmin();
  } catch (error) {
    if (error instanceof AuthError || error instanceof ForbiddenError) return <AccessDenied />;
    throw error;
  }
  return <PlatformShell>{children}</PlatformShell>;
}
