"use client";

import { useState } from "react";
import { History, IdCard as IdCardIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DigitalPassCard, type PassInfo } from "@/components/digital-pass-card";
import { ErrorState, LoadingState, EmptyState } from "@/components/ui-states";

type Identity = {
  id: string; displayName: string; externalId: string | null; status: string;
  passes: PassInfo[];
  assignments: { id: string; programId: string | null; role: string }[];
};

// Member portal: personal identity + own passes + assignment summary.
// Records shown here come only from sessions the member can already see.
export default function MemberHome() {
  const [orgId, setOrgId] = useState("");
  const [ids, setIds] = useState<Identity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(e: React.FormEvent) {
    e.preventDefault(); setError(null); setIds(null); setLoading(true);
    try {
      const r = await fetch(`/api/v1/orgs/${orgId}/my-pass`);
      const j = await r.json();
      if (!r.ok) { setError(j?.error?.message ?? `Failed (${r.status})`); return; }
      setIds(j.data);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-6 md:px-6 md:py-10">
      <PageHeader
        title="My pass"
        description="Your digital identity. The QR holds an opaque credential — no personal data (ADR-07)."
        eyebrow="Member"
      />
      <form onSubmit={load} className="mt-5 flex gap-2">
        <div className="flex-1">
          <FormField label="Organization ID" htmlFor="member-org">
            <Input id="member-org" value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="Paste your organization ID" className="font-mono" />
          </FormField>
        </div>
        <Button type="submit" disabled={loading} className="self-end">{loading ? "…" : "Load"}</Button>
      </form>

      {loading && <div className="mt-4"><LoadingState label="Loading your identity…" /></div>}
      {error && <div className="mt-4"><ErrorState message={error} retry={() => setError(null)} /></div>}
      {!loading && !error && ids && ids.length === 0 && (
        <div className="mt-4"><EmptyState title="No identity found" description="No profile is linked to your account in this organization. Ask your admin to link it." /></div>
      )}
      {ids?.map((idn) => (
        <div key={idn.id} className="mt-5 space-y-4">
          {idn.passes.length === 0 ? (
            <EmptyState title="No pass issued" description={`Hi ${idn.displayName} — ask your administrator to issue your digital pass.`} />
          ) : (
            idn.passes.map((p) => (
              <DigitalPassCard
                key={p.id}
                personName={idn.displayName}
                externalId={idn.externalId}
                pass={p}
                qrValue={`PRISM1:${p.passPublicId}:PROVISIONED-ON-DEVICE`}
                showPrint
              />
            ))
          )}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><History className="size-4" aria-hidden="true" /> Program assignments</CardTitle>
            </CardHeader>
            <CardContent>
              {idn.assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No program assignments.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {idn.assignments.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                      <IdCardIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                      <span className="font-medium">{a.role}</span>
                      <span className="ml-auto font-mono text-xs text-muted-foreground">program {a.programId?.slice(0, 8) ?? "direct"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      ))}
    </main>
  );
}
