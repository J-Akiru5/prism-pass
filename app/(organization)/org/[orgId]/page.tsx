"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { SessionAgenda } from "@/components/session-agenda";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui-states";
import { CardSkeleton, StatStripSkeleton } from "@/components/ui/skeleton";

type Session = { id: string; policyId: string; type: string; title: string; startsAt: string; endsAt: string };
type RecordRow = { id: string; personId: string; durationMin: number | null; status: string; approvalStatus: string };

async function getJSON(path: string) {
  const r = await fetch(path);
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `Request failed (${r.status})`);
  return j;
}

// Calm dashboard: plain words, one big action, big numbers.
// No jargon, no dense rails — older eyes get 17px+ and breathing room.
export default function OrgDashboard({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const base = `/org/${orgId}`;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [org, setOrg] = useState<{ name: string; status: string; timezone: string } | null>(null);
  const [peopleTotal, setPeopleTotal] = useState(0);
  const [passesTotal, setPassesTotal] = useState(0);
  const [passesActive, setPassesActive] = useState(0);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [latestRecords, setLatestRecords] = useState<RecordRow[]>([]);
  const [latestTitle, setLatestTitle] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, people, passes, sess] = await Promise.all([
        getJSON(`/api/v1/orgs/${orgId}`),
        getJSON(`/api/v1/orgs/${orgId}/people?page=1&pageSize=1`),
        getJSON(`/api/v1/orgs/${orgId}/passes?page=1&pageSize=100`),
        getJSON(`/api/v1/orgs/${orgId}/sessions?page=1&pageSize=5`),
      ]);
      setOrg(o.data);
      setPeopleTotal(people.meta?.total ?? 0);
      setPassesTotal(passes.meta?.total ?? 0);
      setPassesActive(((passes.data ?? []) as { status: string }[]).filter((p) => p.status === "ACTIVE").length);
      const list = (sess.data ?? []) as Session[];
      setSessions(list);
      const now = Date.now();
      const started = list
        .filter((s) => new Date(s.startsAt).getTime() <= now)
        .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
      const primary = started[0] ?? list[0];
      if (primary) {
        setLatestTitle(primary.title);
        const rec = await getJSON(`/api/v1/orgs/${orgId}/records?sessionId=${primary.id}&page=1&pageSize=100`);
        setLatestRecords(rec.data ?? []);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const present = latestRecords.filter((r) => r.status === "PRESENT").length;
  const late = latestRecords.filter((r) => r.status === "LATE").length;
  const other = latestRecords.length - present - late;
  const total = Math.max(1, latestRecords.length);
  const pending = latestRecords.filter((r) => r.approvalStatus === "PENDING").length;

  return (
    <>
      <PageHeader
        title={org ? `Hello, ${org.name}` : "Your organization"}
        description={org ? `${peopleTotal} people · ${passesActive} active passes · ${org.timezone}` : "Loading your organization…"}
        actions={
          <>
            <Link href="/scan" className="w-full sm:w-auto">
              <Button variant="default" size="lg" className="h-14 w-full px-6 text-[17px] sm:w-auto">
                <ScanLine aria-hidden="true" /> Scan a pass
              </Button>
            </Link>
            <Link href={`${base}/attendance`} className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="h-14 w-full px-6 text-[16px] sm:w-auto">
                View sessions
              </Button>
            </Link>
          </>
        }
      />

      {loading && (
        <div className="mt-6 space-y-3 md:mt-8 md:space-y-6" role="status" aria-label="Loading your numbers">
          <StatStripSkeleton />
          <CardSkeleton rows={3} />
        </div>
      )}
      {error && <div className="mt-8"><ErrorState message={error} retry={load} /></div>}

      {!loading && !error && (
        <div className="mt-6 space-y-4 md:mt-8 md:space-y-6">
          {(pending + other > 0) && (
            <div className="grid grid-cols-[auto_1fr] items-start gap-x-3.5 gap-y-3 rounded-xl bg-amber-50 p-3.5 ring-1 ring-inset ring-amber-200/80 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-x-4 sm:p-4">
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700">
                <AlertTriangle className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-snug text-amber-950">
                  {pending + other === 1 ? "One entry needs approval" : `${pending + other} entries need approval`}
                </p>
                <p className="mt-0.5 text-[13.5px] leading-snug text-amber-900/75">
                  A late scan has to be confirmed by a manager before it counts.
                </p>
              </div>
              <Link href={`${base}/attendance`} className="col-span-2 sm:col-span-1">
                <Button className="h-11 w-full bg-amber-600 px-5 text-[14.5px] font-semibold text-white shadow-none hover:bg-amber-700 sm:h-10 sm:w-auto">
                  Review
                </Button>
              </Link>
            </div>
          )}

          <section aria-label="At a glance" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="grid grid-cols-1 divide-y divide-slate-200/80 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {[
                { label: "People", hint: "everyone in your list", value: peopleTotal },
                { label: "Checked in", hint: latestTitle ? `at ${latestTitle}` : "no session yet", value: latestRecords.length },
                { label: "Active passes", hint: `${passesTotal} issued in total`, value: passesActive },
              ].map((m) => (
                <div key={m.label} className="px-5 py-4 sm:py-5">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">{m.label}</p>
                  <p className="tnum mt-2 text-[36px] font-semibold leading-none tracking-[-0.03em] text-slate-900">{m.value}</p>
                  <p className="mt-2 truncate text-[13.5px] text-slate-500">{m.hint}</p>
                </div>
              ))}
            </div>
          </section>

          <Card>
            <CardContent className="p-5 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[19px] font-bold tracking-tight text-slate-900">
                  {latestTitle ? `Today: ${latestTitle}` : "Attendance"}
                </h2>
                <Link href={`${base}/attendance`} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 py-2 text-[16px] font-semibold text-blue-700">
                  See details <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
              {latestRecords.length === 0 ? (
                <p className="mt-3 text-[16px] leading-relaxed text-slate-600">
                  Nothing scanned yet. Tap <strong>Scan a pass</strong> above to check someone in.
                </p>
              ) : (
                <>
                  <div className="mt-4 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${present} on time, ${late} late, ${other} other`}>
                    <span className="block h-full bg-emerald-500" style={{ width: `${(present / total) * 100}%` }} />
                    <span className="block h-full bg-amber-500" style={{ width: `${(late / total) * 100}%` }} />
                    <span className="block h-full bg-slate-300" style={{ width: `${(other / total) * 100}%` }} />
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-3">
                    {[
                      { label: "On time", n: present, dot: "bg-emerald-500" },
                      { label: "Late", n: late, dot: "bg-amber-500" },
                      { label: "Other", n: other, dot: "bg-slate-300" },
                    ].map((row) => (
                      <div key={row.label}>
                        <dt className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          <span aria-hidden="true" className={`size-1.5 rounded-full ${row.dot}`} />
                          {row.label}
                        </dt>
                        <dd className="tnum mt-1 text-[19px] font-semibold leading-none text-slate-900">
                          {row.n}
                          <span className="ml-1.5 text-[12.5px] font-medium text-slate-400">{Math.round((row.n / total) * 100)}%</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </CardContent>
          </Card>

          <section aria-labelledby="recent-heading">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="recent-heading" className="text-[19px] font-bold tracking-tight text-slate-900">Recent sessions</h2>
              <Link href={`${base}/attendance`} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-[15px] font-semibold text-blue-700">
                Open schedule <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            {sessions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-[15px] text-slate-600">
                Nothing scheduled.{" "}
                <Link href={`${base}/attendance`} className="font-semibold text-blue-700 underline underline-offset-4">Create a session</Link>.
              </p>
            ) : (
              <SessionAgenda
                sessions={[...sessions]
                  .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
                  .slice(0, 3)}
                hrefFor={() => `${base}/attendance`}
              />
            )}
          </section>

        </div>
      )}
    </>
  );
}
