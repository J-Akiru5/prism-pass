"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarCheck, IdCard, ScanLine, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { ErrorState, LoadingState, EmptyState } from "@/components/ui-states";

type Session = { id: string; policyId: string; type: string; title: string; startsAt: string; endsAt: string };
type RecordRow = { id: string; personId: string; durationMin: number | null; status: string; approvalStatus: string };

async function getJSON(path: string) {
  const r = await fetch(path);
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `Request failed (${r.status})`);
  return j;
}

// Organization dashboard: every number comes from live list endpoints
// (totals), never fabricated. Empty states when there is no data yet.
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
      setPeopleTotal(o.data ? (people.meta?.total ?? 0) : 0);
      setPassesTotal(passes.meta?.total ?? 0);
      setPassesActive(((passes.data ?? []) as { status: string }[]).filter((p) => p.status === "ACTIVE").length);
      setSessions(sess.data ?? []);
      const latest = (sess.data ?? [])[0] as Session | undefined;
      if (latest) {
        setLatestTitle(latest.title);
        const rec = await getJSON(`/api/v1/orgs/${orgId}/records?sessionId=${latest.id}&page=1&pageSize=100`);
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
  const maxBar = Math.max(1, present, late, other);

  return (
    <>
      <PageHeader
        title={org ? `${org.name}` : "Organization dashboard"}
        description={org ? `Timezone ${org.timezone} · data resolved through your verified membership.` : "Loading organization…"}
        eyebrow="Overview"
        actions={
          <>
            <Link href={`${base}/attendance`}><Button variant="outline" size="sm"><CalendarCheck aria-hidden="true" /> Sessions</Button></Link>
            <Link href="/scan"><Button variant="gold" size="sm"><ScanLine aria-hidden="true" /> Open scanner</Button></Link>
          </>
        }
      />
      {org && <p className="mt-2"><Badge variant={org.status === "ACTIVE" ? "success" : "danger"}>{org.status}</Badge></p>}

      {loading && <div className="mt-6"><LoadingState label="Loading organization activity…" /></div>}
      {error && <div className="mt-6"><ErrorState message={error} retry={load} /></div>}

      {!loading && !error && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="People" value={String(peopleTotal)} sub="Directory members" icon={Users} />
            <StatCard label="Active passes" value={`${passesActive}`} sub={`${passesTotal} issued total`} icon={IdCard} tone="info" />
            <StatCard label="Latest session" value={latestRecords.length ? String(latestRecords.length) : "0"} sub={latestTitle || "No sessions yet"} icon={ScanLine} tone="success" />
            <StatCard label="Late / other" value={latestRecords.length ? `${late + other}` : "0"} sub={latestTitle ? `${late} late · ${other} other` : "No records yet"} icon={Users} tone={late + other > 0 ? "warning" : "default"} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Latest session breakdown</CardTitle>
                <CardDescription>{latestTitle || "Create a session to see live attendance here."}</CardDescription>
              </CardHeader>
              <CardContent>
                {latestRecords.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No records yet — scan a pass from the attendance page or the scanner.</p>
                ) : (
                  <div className="space-y-2.5" role="img" aria-label={`${present} present, ${late} late, ${other} other`}>
                    {[
                      { label: "Present", n: present, cls: "bg-success" },
                      { label: "Late", n: late, cls: "bg-accent" },
                      { label: "Other", n: other, cls: "bg-muted-foreground/60" },
                    ].map((b) => (
                      <div key={b.label} className="flex items-center gap-3 text-sm">
                        <span className="w-16 text-muted-foreground">{b.label}</span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full rounded-full ${b.cls}`} style={{ width: `${Math.max(2, (b.n / maxBar) * 100)}%` }} />
                        </div>
                        <span className="w-8 text-right font-mono font-semibold">{b.n}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Upcoming sessions</CardTitle>
                <CardDescription>Next scheduled check-in windows.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {sessions.length === 0 ? (
                  <div className="p-5"><EmptyState title="No sessions yet" description="Create a policy and session on the attendance page." action={<Link href={`${base}/attendance`}><Button size="sm">Go to attendance</Button></Link>} /></div>
                ) : (
                  <DataTable columns={["Session", "Type", "Starts", ""]} caption="Upcoming sessions">
                    {sessions.slice(0, 5).map((s) => (
                      <TableRow key={s.id}>
                        <TableCell><span className="font-medium">{s.title}</span></TableCell>
                        <TableCell><Badge variant="info">{s.type}</Badge></TableCell>
                        <TableCell mono>{new Date(s.startsAt).toLocaleString()}</TableCell>
                        <TableCell><Link href={`${base}/attendance`} className="inline-flex items-center gap-1 text-primary hover:underline">Open <ArrowRight className="size-3.5" aria-hidden="true" /></Link></TableCell>
                      </TableRow>
                    ))}
                  </DataTable>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
