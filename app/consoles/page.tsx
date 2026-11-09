import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ScanLine, ShieldCheck, UserRound } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { SyntaxureCredit } from "@/components/brand/syntaxure-credit";
import { SignOutButton } from "@/components/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { getSessionUser } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { roleGrants, type Role } from "@/packages/authorization/permissions";
import { presetForRole, presetLabel } from "@/packages/authorization/presets";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consoles" };

type Membership = {
  status: string;
  role: Role;
  organization: { id: string; name: string; slug: string; status: string };
};

const TOOLS = [
  { href: "/member", title: "My pass", desc: "Show your QR and see your history", Icon: UserRound },
  { href: "/scan", title: "Scanner", desc: "Check a pass in with the camera", Icon: ScanLine },
  { href: "/platform", title: "Platform", desc: "Organizations, health, and audit", Icon: ShieldCheck },
];

// Console chooser: organizations come from the verified membership, so this page
// is the real entry point instead of a hard-coded list.
export default async function ConsolesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/consoles");

  let memberships: Membership[] = [];
  let internalId: string | null = null;
  try {
    const internal = await prisma.user.findUnique({
      where: { authId: user.id },
      select: {
        id: true,
        memberships: {
          select: {
            status: true,
            role: true,
            organization: { select: { id: true, name: true, slug: true, status: true } },
          },
        },
      },
    });
    internalId = internal?.id ?? null;
    memberships = ((internal?.memberships ?? []) as Membership[]).filter(
      (m) => m.status === "ACTIVE" && m.organization.status === "ACTIVE"
    );
  } catch {
    memberships = [];
  }

  let isPlatformAdmin = false;
  if (internalId) {
    try {
      isPlatformAdmin = Boolean(
        await prisma.platformAdmin.findUnique({ where: { userId: internalId }, select: { userId: true } }),
      );
    } catch {
      isPlatformAdmin = false;
    }
  }
  const canScan = memberships.some((m) => roleGrants(m.role, "attendance.scan"));

  // A plain member has no console to choose: land on the pass they actually use.
  if (memberships.length > 0 && !isPlatformAdmin && !canScan) {
    redirect(`/member?org=${encodeURIComponent(memberships[0].organization.id)}`);
  }

  const tools = TOOLS.filter((tool) => {
    if (tool.href === "/platform") return isPlatformAdmin;
    if (tool.href === "/scan") return canScan;
    return true;
  });

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 md:px-6">
          <Link href="/" aria-label="Prism Pass home" className="shrink-0">
            <BrandLogo size={32} />
          </Link>

          <div className="flex min-w-0 items-center gap-2.5">
            <span className="hidden max-w-[220px] truncate text-[13.5px] text-slate-500 sm:block">{user.email}</span>
            <SignOutButton />
          </div>
          
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-7 md:px-6 md:pt-10">
        <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.022em] text-slate-900">Where to?</h1>
        <p className="pp-lead mt-2">
          Signed in as <span className="font-medium text-slate-900 dark:text-white">{user.email}</span>
        </p>

        <section aria-labelledby="orgs-heading" className="mt-7">
          <h2 id="orgs-heading" className="text-[17px] font-bold text-slate-900 dark:text-white">
            Your organizations
          </h2>

          {memberships.length === 0 ? (
            <p className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
              You are not in an organization yet. Ask an administrator to add you.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {memberships.map((m) => (
                <li key={m.organization.id}>
                  <Link
                    href={`/org/${m.organization.id}`}
                    className="flex min-h-[72px] items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-white/5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[18px] font-semibold text-slate-900 dark:text-white">
                        {m.organization.name}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="info" title={`Raw role: ${m.role}`}>
                          {presetLabel(presetForRole(m.role))}
                        </Badge>
                        <span className="font-mono text-[12px] text-slate-500 dark:text-slate-400" title="Raw role">
                          {m.role}
                        </span>
                        <span className="font-mono text-[13px] text-slate-500 dark:text-slate-400">{m.organization.slug}</span>
                      </span>
                    </span>
                    <ArrowRight className="size-5 shrink-0 text-slate-400" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="tools-heading" className="mt-8">
          <h2 id="tools-heading" className="text-[17px] font-bold text-slate-900 dark:text-white">
            Personal tools
          </h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-3">
            {tools.map(({ href, title, desc, Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex h-full min-h-[96px] flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-white/5"
                >
                  <Icon className="size-5 text-blue-600" aria-hidden="true" />
                  <span className="text-[16.5px] font-semibold text-slate-900 dark:text-white">{title}</span>
                  <span className="text-[14px] leading-snug text-slate-600 dark:text-slate-400">{desc}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-10 flex justify-center">
          <SyntaxureCredit />
        </div>
      </main>
    </div>
  );
}
