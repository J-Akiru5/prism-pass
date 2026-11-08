import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, ScanLine, ShieldCheck, UserRound } from "lucide-react";
import { PrismPassLogo } from "@/components/brand/prism-pass-logo";
import { SyntaxureCredit } from "@/components/brand/syntaxure-credit";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSessionUser } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consoles" };

type Membership = {
  role: string;
  organization: { id: string; name: string; slug: string; status: string };
};

// Console chooser: organizations come from the verified membership, so this page
// is the real entry point instead of a hard-coded list.
export default async function ConsolesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/consoles");

  let memberships: Membership[] = [];
  try {
    const internal = await prisma.user.findUnique({
      where: { authId: user.id },
      select: {
        memberships: {
          where: { status: "ACTIVE" },
          select: { role: true, organization: { select: { id: true, name: true, slug: true, status: true } } },
        },
      },
    });
    memberships = ((internal?.memberships ?? []) as Membership[]).filter(
      (m) => m.organization.status === "ACTIVE"
    );
  } catch {
    memberships = [];
  }

  return (
    <div className="min-h-dvh bg-background">
      <div className="relative overflow-hidden bg-gradient-to-br from-navy-deep via-navy to-navy-light text-white">
        <div aria-hidden="true" className="absolute -right-16 -top-16 h-64 w-64 rounded-full border border-white/10" />
        <div aria-hidden="true" className="absolute -bottom-24 right-24 h-48 w-48 rounded-full border border-white/10" />
        <div className="relative mx-auto flex max-w-4xl items-start justify-between gap-4 px-6 pb-12 pt-12 md:pt-16">
          <div>
            <Link href="/" aria-label="Back to site home">
              <PrismPassLogo onDark />
            </Link>
            <h1 className="mt-5 font-display text-4xl font-bold leading-tight md:text-5xl">Choose a console</h1>
            <p className="mt-3 max-w-xl text-[15px] text-white/75">
              Signed in as <span className="font-mono text-white/90">{user.email}</span>. Organizations below
              come from your verified membership.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <section aria-labelledby="orgs-heading">
          <div className="flex items-baseline justify-between border-b pb-2">
            <h2 id="orgs-heading" className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Organizations
            </h2>
            <span className="font-mono text-[11px] text-muted-foreground">{memberships.length}</span>
          </div>

          {memberships.length === 0 ? (
            <p className="pt-4 text-sm text-muted-foreground">
              No active membership yet. Ask an administrator to add you to an organization.
            </p>
          ) : (
            <ul className="pt-1">
              {memberships.map((m) => (
                <li key={m.organization.id}>
                  <Link
                    href={`/org/${m.organization.id}`}
                    className="group flex items-center justify-between gap-4 border-b py-4 transition-colors hover:bg-muted/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-display text-lg font-semibold group-hover:underline">
                        {m.organization.name}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        {m.role} · {m.organization.slug}
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      Open <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="tools-heading" className="mt-12">
          <h2 id="tools-heading" className="border-b pb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Personal tools
          </h2>
          <ul className="grid gap-px pt-1 sm:grid-cols-3">
            {[
              { href: "/member", title: "Member", desc: "Your pass and history", Icon: UserRound },
              { href: "/scan", title: "Scanner", desc: "Verify and check in", Icon: ScanLine },
              { href: "/platform", title: "Platform", desc: "Provisioning and oversight", Icon: ShieldCheck },
            ].map(({ href, title, desc, Icon }) => (
              <li key={href}>
                <Link href={href} className="group flex h-full flex-col gap-2 border-b px-0 py-4 transition-colors hover:bg-muted/40 sm:border-b-0 sm:px-4 sm:first:pl-0">
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  <span className="font-medium group-hover:underline">{title}</span>
                  <span className="text-xs text-muted-foreground">{desc}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-12 flex justify-center">
          <SyntaxureCredit />
        </div>
      </main>
    </div>
  );
}
