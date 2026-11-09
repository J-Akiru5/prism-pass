"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConsoleBar } from "@/components/console-bar";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { PageHeader } from "@/components/page-header";
import { DigitalPassCard, type PassInfo } from "@/components/digital-pass-card";
import { Button } from "@/components/ui/button";
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
  const [reissuing, setReissuing] = useState<string | null>(null);

  useEffect(() => {
    if (orgId || orgs.length === 0) return;
    const fromUrl = new URLSearchParams(window.location.search).get("org");
    setOrgId(fromUrl && orgs.some((org) => org.id === fromUrl) ? fromUrl : orgs[0].id);
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

  async function reissuePass(passId: string) {
    if (!orgId) return;
    setReissuing(passId);
    setError(null);
    try {
      const response = await fetch(`/api/v1/orgs/${orgId}/my-pass/reissue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ passId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Could not re-issue the pass");
      const qrPayload = payload.data.qrPayload as string;
      const version = payload.data.pass.version as number;
      setIds((current) =>
        current?.map((identity) => ({
          ...identity,
          passes: identity.passes.map((pass) =>
            pass.id === passId ? { ...pass, version, qrPayload } : pass,
          ),
        })) ?? null,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReissuing(null);
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <ConsoleBar label="Member" orgHref={orgId ? `/org/${orgId}` : undefined} />
      <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6 md:px-6 md:pt-8 lg:pb-16">
        <PageHeader
          title="My pass"
          description="Show this QR when you arrive so your attendance is recorded."
        />

        {orgsLoading && <div className="mt-6"><LoadingState label="Loading your organization…" /></div>}

        {!orgsLoading && orgsError && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[15px] text-red-800">
            <p className="font-bold">Could not load your organization</p>
            <p className="mt-1">{orgsError}</p>
            <Link href="/login?next=/member" className="mt-2 inline-flex min-h-[44px] items-center font-semibold underline underline-offset-4">Sign in again</Link>
          </div>
        )}

        {!orgsLoading && !orgsError && orgs.length === 0 && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px]">
            <p className="font-bold text-slate-900">No organization yet</p>
            <p className="mt-1 text-slate-600">Your account is not a member of an organization.</p>
          </div>
        )}

        {orgs.length > 1 && (
          <div className="mt-5">
            <label htmlFor="member-org" className="mb-1.5 block text-[15px] font-semibold text-slate-700">Organization</label>
            <select
              id="member-org"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="pp-select h-12 w-full rounded-[10px] border border-slate-200 bg-white px-3.5 text-[16px] font-medium text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)_inset] transition-[border-color,box-shadow] hover:border-slate-300 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/12"
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
                <div key={p.id}>
                  <DigitalPassCard
                    personName={idn.displayName}
                    externalId={idn.externalId}
                    orgName={org?.name}
                    pass={p}
                    qrValue={p.qrPayload}
                    showPrint
                  />
                  {!p.qrPayload && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                      <p className="text-[13.5px] leading-relaxed text-amber-900">
                        This pass was issued with a one-time secret and cannot be redisplayed. Re-issue it once
                        to show a stable QR here.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => void reissuePass(p.id)}
                        disabled={reissuing === p.id}
                      >
                        {reissuing === p.id ? "Re-issuing…" : "Re-issue my QR"}
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}

            <section>
              <h2 className="text-[17px] font-bold text-slate-900">Your groups</h2>
              {idn.assignments.length === 0 ? (
                <p className="mt-2 text-[15px] text-slate-600">You are not in a group yet.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {idn.assignments.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-xl bg-slate-50 px-3 py-2.5 text-[15px]">
                      <span className="font-semibold capitalize text-slate-900">{a.role}</span>
                      <span className="text-[14px] text-slate-600">
                        {a.programId ? a.programId.replace("demo-program-", "") : "Direct member"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ))}
      </main>
      <MobileTabBar base={orgId ? `/org/${orgId}` : undefined} breakpoint="lg" />
    </div>
  );
}
