"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarCheck, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingState } from "@/components/ui-states";

type Session = { id: string; policyId: string; type: string; title: string; startsAt: string; endsAt: string };
type RecordRow = { id: string; personId: string; durationMin: number | null; status: string; approvalStatus: string };

async function getJSON(path: string) {
  const r = await fetch(path);
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `Request failed (${r.status})`);
  return j;
}

// Organization dashboard: every number comes from live list endpoints, never
// fabricated. Presented as a console — hairline rules and tabular figures instead
// of a KPI card grid.
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
      // Show the session that actually has attendance: the most recent one that has
      // already started, otherwise the next upcoming one.
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

  const metrics = [
    { label: "People", value: peopleTotal, sub: "in directory" },
    { label: "Passes active", value: passesActive, sub: `${passesTotal} issued` },
    { label: "Checked in", value: latestRecords.length, sub: latestTitle ? "latest session" : "no session yet" },
    { label: "Needs review", value: pending + other, sub: pending ? `${pending} pending approval` : "no exceptions" },
  ];

  return (
    <>
      <PageHeader
        title={org ? org.name : "Organization dashboard"}
        description={org ? `${org.timezone} · resolved through your verified membership` : "Loading organization…"}
        eyebrow={org ? org.status : "Overview"}
        actions={
          <>
            <Link href={`${base}/attendance`}><Button variant="outline" size="sm"><CalendarCheck aria-hidden="true" /> Sessions</Button></Link>
            <Link href="/scan"><Button variant="gold" size="sm"><ScanLine aria-hidden="true" /> Open scanner</Button></Link>
          </>
        }
      />

      {loading && <div className="mt-10"><LoadingState label="Loading organization activity…" /></div>}
      {error && <div className="mt-10"><ErrorState message={error} retry={load} /></div>}

      {!loading && !error && (
        <>
          {/* Metric rail: one band, hairline dividers, tabular figures. No boxes. */}
          <dl className="mt-8 grid grid-cols-2 border-y sm:grid-cols-4">
            {metrics.map((m, i) => (
              <div
                key={m.label}
                className={[
                  "px-5 py-6 first:pl-0",
                  i < 2 ? "border-b sm:border-b-0" : "",
                  "sm:border-l sm:first:border-l-0",
                  i % 2 === 1 ? "border-l" : "",
                ].join(" ")}
              >
                <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{m.label}</dt>
                <dd className="mt-2 font-mono text-[34px] font-semibold leading-none tabular-nums">{m.value}</dd>
                <p className="mt-2 text-xs text-muted-foreground">{m.sub}</p>
              </div>
            ))}
          </dl>

          <section className="mt-12">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b pb-3">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Session mix{latestTitle ? ` · ${latestTitle}` : ""}
              </h2>
              <Link href={`${base}/attendance`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                Attendance log <ArrowUpRight className="size-3" aria-hidden="true" />
              </Link>
            </div>

            <div className="grid gap-10 pt-6 md:grid-cols-[1.1fr_1fr]">
              <div>
                {latestRecords.length === 0 ? (
                  <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                    No records yet. Open a session and scan a pass — every number on this page comes from those events.
                  </p>
                ) : (
                  <>
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${present} present, ${late} late, ${other} other`}>
                      <span className="h-full bg-success" style={{ width: `${(present / total) * 100}%` }} />
                      <span className="h-full bg-accent" style={{ width: `${(late / total) * 100}%` }} />
                      <span className="h-full bg-muted-foreground/50" style={{ width: `${(other / total) * 100}%` }} />
                    </div>
                    <dl className="mt-5 space-y-0">
                      {[
                        { label: "Present", n: present, swatch: "bg-success" },
                        { label: "Late", n: late, swatch: "bg-accent" },
                        { label: "Other", n: other, swatch: "bg-muted-foreground/50" },
                      ].map((row) => (
                        <div key={row.label} className="flex items-center justify-between border-b py-2.5 last:border-b-0">
                          <dt className="flex items-center gap-2.5 text-sm text-muted-foreground">
                            <span className={`size-2 rounded-full ${row.swatch}`} aria-hidden="true" />
                            {row.label}
                          </dt>
                          <dd className="font-mono text-sm tabular-nums">
                            {row.n}
                            <span className="ml-2 text-xs text-muted-foreground">{Math.round((row.n / total) * 100)}%</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </>
                )}
              </div>

              <div>
                <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Recent sessions</h3>
                {sessions.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Nothing scheduled.{" "}
                    <Link href={`${base}/attendance`} className="text-foreground underline underline-offset-4">Create a session</Link>.
                  </p>
                ) : (
                  <ul className="mt-2">
                    {[...sessions]
                      .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
                      .slice(0, 5)
                      .map((s) => (
                      <li key={s.id} className="flex items-baseline justify-between gap-4 border-b py-3 last:border-b-0">
                        <Link href={`${base}/attendance`} className="group min-w-0">
                          <span className="block truncate text-sm font-medium group-hover:underline">{s.title}</span>
                          <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                            {s.type} · {new Date(s.startsAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </Link>
                        <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
