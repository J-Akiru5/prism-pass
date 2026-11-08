"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConsoleBar } from "@/components/console-bar";
import { PageHeader } from "@/components/page-header";
import { DigitalPassCard, type PassInfo } from "@/components/digital-pass-card";
import { ErrorState, LoadingState, EmptyState } from "@/components/ui-states";
import { useOrgs } from "@/lib/use-orgs";

type Identity = {
  id: string;
  displayName: string;
  externalId: string | null;
  status: string;
  passes: PassInfo[];
  assignments: { id: string; programId: string | null; role: string }[];
};

// Member portal: personal identity + own passes + assignment summary. The
// organization is resolved from membership, never typed in as a UUID.
export default function MemberHome() {
  const { orgs, loading: orgsLoading, error: orgsError } = useOrgs();
  const [orgId, setOrgId] = useState("");
  const [ids, setIds] = useState<Identity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (orgId || orgs.length === 0) return;
    setOrgId(orgs[0].id);
  }, [orgs, orgId]);

  useEffect(() => {
    if (!orgId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setIds(null);
    fetch(`/api/v1/orgs/${orgId}/my-pass`, { credentials: "include" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message ?? `Failed (${r.status})`);
        return (j.data ?? []) as Identity[];
      })
      .then((data) => {
        if (alive) setIds(data);
      })
      .catch((e) => {
        if (alive) setError((e as Error).message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [orgId]);

  const org = orgs.find((o) => o.id === orgId);

  return (
    <div className="min-h-dvh bg-background">
      <ConsoleBar label="Member" orgHref={orgId ? `/org/${orgId}` : undefined} />
      <main className="mx-auto max-w-xl px-4 pb-16 pt-8 md:px-6">
        <PageHeader
          title="My pass"
          description="Your digital identity. The credential is opaque — it carries no personal data (ADR-07)."
          eyebrow="Member"
        />

        {orgsLoading && <p className="mt-6 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Loading organizations…</p>}

        {!orgsLoading && orgsError && (
          <div className="mt-6 border-y py-4 text-sm">
            <p className="font-medium">Could not load your organizations</p>
            <p className="mt-1 text-muted-foreground">{orgsError}</p>
            <Link href="/login?next=/member" className="mt-2 inline-block underline underline-offset-4">Sign in again</Link>
          </div>
        )}

        {!orgsLoading && !orgsError && orgs.length === 0 && (
          <div className="mt-6 border-y py-4 text-sm">
            <p className="font-medium">No organization yet</p>
            <p className="mt-1 text-muted-foreground">Your account has no active membership.</p>
          </div>
        )}

        {orgs.length > 1 && (
          <div className="mt-6 flex items-center justify-between gap-4 border-y py-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Organization</span>
            <select
              aria-label="Organization"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
        )}

        {loading && <div className="mt-8"><LoadingState label="Loading your identity…" /></div>}
        {error && <div className="mt-8"><ErrorState message={error} retry={() => setOrgId((v) => v)} /></div>}

        {!loading && !error && ids && ids.length === 0 && (
          <div className="mt-8">
            <EmptyState title="No identity linked" description="No profile is linked to your account in this organization. Ask an administrator to link it." />
          </div>
        )}

        {!loading && ids?.map((idn) => (
          <div key={idn.id} className="mt-8 space-y-6">
            {idn.passes.length === 0 ? (
              <EmptyState title="No pass issued" description={`Hi ${idn.displayName} — ask your administrator to issue your digital pass.`} />
            ) : (
              idn.passes.map((p) => (
                <DigitalPassCard
                  key={p.id}
                  personName={idn.displayName}
                  externalId={idn.externalId}
                  orgName={org?.name}
                  pass={p}
                  showPrint
                />
              ))
            )}

            <section>
              <h2 className="border-b pb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Programs</h2>
              {idn.assignments.length === 0 ? (
                <p className="pt-3 text-sm text-muted-foreground">No program assignments.</p>
              ) : (
                <ul className="pt-1">
                  {idn.assignments.map((a) => (
                    <li key={a.id} className="flex items-baseline justify-between gap-4 border-b py-2.5 text-sm last:border-b-0">
                      <span className="font-medium capitalize">{a.role}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {a.programId ? `program ${a.programId.replace("demo-program-", "")}` : "direct"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ))}
      </main>
    </div>
  );
}
