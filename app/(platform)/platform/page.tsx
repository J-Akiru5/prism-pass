import Link from "next/link";
import { AuthError, ForbiddenError, requirePlatformAdmin } from "@/lib/tenant";
import { OrgLedger } from "@/components/platform/org-ledger";

// Session + platform_admin checks need cookies, so this route is never static.
export const dynamic = "force-dynamic";

/**
 * Server-side gate. `requirePlatformAdmin` is the authority here — the client
 * component's fetch is authorized again by `/api/v1/platform/orgs`, so hiding
 * or revealing UI controls can never grant access.
 */
export default async function PlatformHome() {
  try {
    await requirePlatformAdmin();
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) {
      return (
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-gold-dark">Platform</p>
          <h1 className="mt-1 font-display text-2xl font-bold leading-tight md:text-3xl">Platform access required</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            This console is limited to platform administrators. An organization OWNER — even of every tenant — does not
            inherit platform access (ADR-11). Ask an existing platform admin for a grant.
          </p>
          <p className="mt-5">
            <Link href="/consoles" className="text-sm font-medium text-primary underline underline-offset-4">
              Back to consoles
            </Link>
          </p>
        </main>
      );
    }
    throw e;
  }

  return <OrgLedger />;
}
