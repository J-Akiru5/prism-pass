"use client";

import { use, useCallback, useEffect, useState } from "react";
import { CalendarPlus, ClipboardList, ScanLine, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AttendanceTimelineRows, type RecordRow } from "@/components/attendance-timeline";
import { ErrorState, LoadingState, EmptyState } from "@/components/ui-states";

type Policy = { id: string; name: string; graceMin: number; lateThresholdMin: number; duplicateWindowSec: number };
type Session = { id: string; policyId: string; type: string; title: string; startsAt: string; endsAt: string; timezone: string };

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `Request failed (${r.status})`);
  return j.data;
}

export default function AttendancePage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [activeSession, setActiveSession] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cred, setCred] = useState("");
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [peopleNames, setPeopleNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        api(`/api/v1/orgs/${orgId}/policies?page=1&pageSize=100`),
        api(`/api/v1/orgs/${orgId}/sessions?page=1&pageSize=100`),
      ]);
      setPolicies(p); setSessions(s);
      if (s.length && !activeSession) setActiveSession(s[0].id);
      setError(null);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [orgId, activeSession]);

  const loadRecords = useCallback(async () => {
    if (!activeSession) return;
    try {
      const rows: RecordRow[] = await api(`/api/v1/orgs/${orgId}/records?sessionId=${activeSession}&page=1&pageSize=100`);
      setRecords(rows);
      const missing = rows.filter((r) => !peopleNames[r.personId]).map((r) => r.personId);
      const names: Record<string, string> = {};
      await Promise.all(missing.map(async (id) => {
        try { const p = await api(`/api/v1/orgs/${orgId}/people/${id}`); names[id] = p.displayName; } catch { /* scoped role */ }
      }));
      if (Object.keys(names).length) setPeopleNames((m) => ({ ...m, ...names }));
    } catch { /* keep previous */ }
  }, [orgId, activeSession, peopleNames]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  async function createPolicy(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await api(`/api/v1/orgs/${orgId}/policies`, { method: "POST", body: JSON.stringify({ name: String(fd.get("name")), graceMin: Number(fd.get("grace") ?? 10), lateThresholdMin: Number(fd.get("late") ?? 15) }) });
      (e.target as HTMLFormElement).reset(); await load();
    } catch (e) { setError((e as Error).message); }
  }

  async function createSession(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const now = new Date();
      await api(`/api/v1/orgs/${orgId}/sessions`, {
        method: "POST",
        body: JSON.stringify({
          policyId: String(fd.get("policyId")), type: String(fd.get("type") ?? "EVENT"), title: String(fd.get("title")),
          startsAt: new Date(String(fd.get("starts")) || now.toISOString()).toISOString(),
          endsAt: new Date(String(fd.get("ends")) || new Date(now.getTime() + 4 * 3600000).toISOString()).toISOString(),
        }),
      });
      (e.target as HTMLFormElement).reset(); await load();
    } catch (e) { setError((e as Error).message); }
  }

  async function scan(e: React.FormEvent) {
    e.preventDefault(); setScanResult(null); setError(null);
    try {
      const j = await api(`/api/v1/orgs/${orgId}/sessions/${activeSession}/scans`, {
        method: "POST", body: JSON.stringify({ credential: cred.trim(), clientTs: new Date().toISOString() }),
      });
      setScanResult(`${j.event.type} · ${j.record?.status ?? "recorded"}${j.duplicate ? " (duplicate)" : ""}`);
      setCred(""); await loadRecords();
    } catch (e) { setError((e as Error).message); }
  }

  const enriched = records.map((r) => ({ ...r, personName: peopleNames[r.personId] }));

  return (
    <>
      <PageHeader
        title="Attendance — one engine"
        description="Employees, interns, and event participants share this single scan path. Session type is informational only."
        eyebrow={`Sessions · ${sessions.length}`}
      />
      {error && <div className="mt-4"><ErrorState message={error} retry={load} /></div>}

      {loading ? <div className="mt-6"><LoadingState label="Loading policies and sessions…" /></div> : (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Policies ({policies.length})</CardTitle>
                <CardDescription>Grace, lateness, and duplicate windows. Requires organization.manage.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {policies.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                      <ClipboardList className="size-4 text-muted-foreground" aria-hidden="true" />
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-auto font-mono text-xs text-muted-foreground">grace {p.graceMin}m · late +{p.lateThresholdMin}m · dupe {p.duplicateWindowSec}s</span>
                    </li>
                  ))}
                  {policies.length === 0 && <li className="text-muted-foreground">Create a policy first.</li>}
                </ul>
                <form onSubmit={createPolicy} className="mt-3 flex gap-2">
                  <Input name="name" required placeholder="Policy name" aria-label="Policy name" className="flex-1" />
                  <Input name="grace" type="number" defaultValue={10} title="Grace minutes" aria-label="Grace minutes" className="w-20" />
                  <Input name="late" type="number" defaultValue={15} title="Late threshold" aria-label="Late threshold" className="w-20" />
                  <Button variant="outline" type="submit">Create</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sessions ({sessions.length})</CardTitle>
                <CardDescription>Select a session to scan and review its records.</CardDescription>
              </CardHeader>
              <CardContent>
                {sessions.length === 0 ? <EmptyState title="No sessions yet" description="Create a session to open check-in." /> : (
                  <ul className="max-h-56 space-y-1 overflow-auto" aria-label="Sessions">
                    {sessions.map((s) => (
                      <li key={s.id}>
                        <button type="button" aria-pressed={activeSession === s.id} onClick={() => setActiveSession(s.id)}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 ${activeSession === s.id ? "bg-muted ring-1 ring-accent" : ""}`}>
                          <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
                          <Badge variant="info">{s.type}</Badge>
                          <span className="hidden font-mono text-xs text-muted-foreground sm:block">{new Date(s.startsAt).toLocaleDateString()}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {policies.length > 0 && (
                  <form onSubmit={createSession} className="mt-3 grid grid-cols-2 gap-2 border-t pt-3">
                    <div className="col-span-2"><FormField label="Session title" htmlFor="sess-title"><Input id="sess-title" name="title" required placeholder="e.g. OJT AM block" /></FormField></div>
                    <select name="policyId" aria-label="Policy" className="h-10 rounded-lg border border-input bg-card px-2 text-sm">{policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                    <select name="type" aria-label="Session type" className="h-10 rounded-lg border border-input bg-card px-2 text-sm">{["EVENT", "OJT", "SHIFT", "CLASS", "VISITOR", "TRAINING"].map((t) => <option key={t} value={t}>{t}</option>)}</select>
                    <Input name="starts" type="datetime-local" aria-label="Starts at" />
                    <Input name="ends" type="datetime-local" aria-label="Ends at" />
                    <Button variant="outline" type="submit" className="col-span-2"><CalendarPlus aria-hidden="true" /> Create session</Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>

          {activeSession && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Live scan + records ({records.length})</CardTitle>
                <CardDescription>Paste a credential or scan from the scanner page. Duplicates are flagged, never double-counted.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={scan} className="flex gap-2">
                  <Input value={cred} onChange={(e) => setCred(e.target.value)} placeholder="PRISM1:… credential (scanner fills this automatically)" aria-label="Credential" className="font-mono" />
                  <Button type="submit" variant="gold"><ScanLine aria-hidden="true" /> Scan</Button>
                </form>
                {scanResult && <p role="status" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-success"><ShieldCheck className="size-4" aria-hidden="true" />{scanResult}</p>}
                <div className="mt-3">
                  {records.length === 0 ? <EmptyState title="No records" description="No scans recorded for this session yet." /> : (
                    <DataTable columns={["Person", "Status", "Approval", "Duration"]} caption="Attendance records">
                      <AttendanceTimelineRows records={enriched} />
                    </DataTable>
                  )}
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <XCircle className="size-3.5" aria-hidden="true" /> Corrections and approvals are available to authorized roles via the adjust / approve endpoints; history is append-only.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  );
}
