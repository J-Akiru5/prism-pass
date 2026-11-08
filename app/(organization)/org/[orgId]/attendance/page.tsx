"use client";

import { use, useCallback, useEffect, useState } from "react";
import { CalendarPlus, ScanLine, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { FormField } from "@/components/ui/form-field";
import { Input, Select } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionAgenda, type AgendaSession } from "@/components/session-agenda";
import { AttendanceTimelineRows, type RecordRow } from "@/components/attendance-timeline";
import { ErrorState, LoadingState, EmptyState } from "@/components/ui-states";

type Policy = { id: string; name: string; graceMin: number; lateThresholdMin: number; duplicateWindowSec: number };
type Session = AgendaSession & { policyId: string; timezone: string };

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
  const [newSession, setNewSession] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        api(`/api/v1/orgs/${orgId}/policies?page=1&pageSize=100`),
        api(`/api/v1/orgs/${orgId}/sessions?page=1&pageSize=100`),
      ]);
      setPolicies(p);
      setSessions(s);
      setActiveSession((current) => current || (s.length ? s[0].id : ""));
      setError(null);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [orgId]);

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
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await api(`/api/v1/orgs/${orgId}/policies`, { method: "POST", body: JSON.stringify({ name: String(fd.get("name")), graceMin: Number(fd.get("grace") ?? 10), lateThresholdMin: Number(fd.get("late") ?? 15) }) });
      form.reset(); setPolicyOpen(false); await load();
    } catch (e) { setError((e as Error).message); }
  }

  async function createSession(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
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
      form.reset(); setNewSession(false); await load();
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
  const current = sessions.find((s) => s.id === activeSession);
  const onTime = records.filter((r) => r.status === "PRESENT").length;
  const late = records.filter((r) => r.status === "LATE").length;
  const pending = records.filter((r) => r.approvalStatus === "PENDING").length;

  return (
    <>
      <PageHeader
        title="Attendance"
        description={loading ? "Loading your schedule…" : "Choose the session you are working, then scan passes. Everything below follows that session."}
        actions={
          <Button variant={newSession ? "outline" : "default"} className="h-12 w-full sm:w-auto" onClick={() => setNewSession((v) => !v)}>
            {newSession ? <><X aria-hidden="true" /> Close</> : <><CalendarPlus aria-hidden="true" /> New session</>}
          </Button>
        }
      />
      {error && <div className="mt-4"><ErrorState message={error} retry={load} /></div>}

      {newSession && (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle>New session</CardTitle>
            <CardDescription>A session is one shift, class, or event that people check into.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={createSession} className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FormField label="Session name" htmlFor="sess-title">
                  <Input id="sess-title" name="title" required placeholder="e.g. OJT morning block" />
                </FormField>
              </div>
              <FormField label="Policy" htmlFor="sess-policy">
                <Select id="sess-policy" name="policyId">
                  {policies.length === 0 ? <option value="">Create a policy first</option> : policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </FormField>
              <FormField label="Type" htmlFor="sess-type">
                <Select id="sess-type" name="type">{["EVENT", "OJT", "SHIFT", "CLASS", "VISITOR", "TRAINING"].map((t) => <option key={t} value={t}>{t}</option>)}</Select>
              </FormField>
              <FormField label="Starts" htmlFor="sess-starts"><Input id="sess-starts" name="starts" type="datetime-local" /></FormField>
              <FormField label="Ends" htmlFor="sess-ends"><Input id="sess-ends" name="ends" type="datetime-local" /></FormField>
              <Button type="submit" className="h-12 sm:col-span-2">Create session</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <section className="mt-6" aria-labelledby="schedule-heading">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="schedule-heading" className="text-[19px] font-bold tracking-tight text-slate-900">Schedule</h2>
          <p className="text-[14px] text-slate-500">{loading ? "Loading…" : `${sessions.length} ${sessions.length === 1 ? "session" : "sessions"} · newest first`}</p>
        </div>
        {loading ? <LoadingState label="Loading sessions…" /> : (
          <SessionAgenda
            sessions={sessions}
            selectedId={activeSession}
            onSelect={setActiveSession}
            emptyLabel="No sessions yet. Use “New session” above to create the first one."
          />
        )}
      </section>

      {activeSession && (
        <section className="mt-6" aria-labelledby="working-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="working-heading" className="text-[19px] font-bold tracking-tight text-slate-900">
              {current ? current.title : "Selected session"}
            </h2>
            <p className="text-[14px] text-slate-500">
              {records.length} recorded · {onTime} on time · {late} late{pending > 0 ? ` · ${pending} awaiting approval` : ""}
            </p>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
            <form onSubmit={scan} className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input value={cred} onChange={(e) => setCred(e.target.value)} placeholder="Paste a credential to record a scan" aria-label="Credential" className="font-mono" />
              <Button type="submit" className="h-12"><ScanLine aria-hidden="true" /> Record scan</Button>
            </form>
            {scanResult && (
              <p role="status" className="mt-2 inline-flex items-center gap-1.5 text-[15px] font-semibold text-emerald-700">
                <ShieldCheck className="size-4" aria-hidden="true" />{scanResult}
              </p>
            )}
          </div>

          <div className="mt-4">
            {records.length === 0 ? (
              <EmptyState title="Nobody yet" description="Scan the first pass to start this session." />
            ) : (
              <DataTable columns={["Person", "Status", "Approval", "Duration"]} caption="Attendance records">
                <AttendanceTimelineRows records={enriched} />
              </DataTable>
            )}
          </div>
        </section>
      )}

      <section className="mt-8" aria-labelledby="policy-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="policy-heading" className="text-[19px] font-bold tracking-tight text-slate-900">Attendance policy</h2>
          <Button variant="ghost" size="sm" onClick={() => setPolicyOpen((v) => !v)}>
            {policyOpen ? "Close" : "New policy"}
          </Button>
        </div>
        <dl className="mt-2 grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-3">
          {policies.length === 0 ? (
            <div className="bg-white p-4 text-[15px] text-slate-600 sm:col-span-3">No policy yet — each session needs one.</div>
          ) : policies.map((p) => (
            <div key={p.id} className="bg-white p-4">
              <dt className="text-[16px] font-semibold text-slate-900">{p.name}</dt>
              <dd className="mt-1 text-[14px] leading-relaxed text-slate-600">
                {p.graceMin} min grace · late after {p.lateThresholdMin} min · ignores repeats for {p.duplicateWindowSec}s
              </dd>
            </div>
          ))}
        </dl>

        {policyOpen && (
          <form onSubmit={createPolicy} className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
            <FormField label="Policy name" htmlFor="pol-name"><Input id="pol-name" name="name" required placeholder="e.g. Standard office" /></FormField>
            <FormField label="Grace (min)" htmlFor="pol-grace"><Input id="pol-grace" name="grace" type="number" defaultValue={10} className="sm:w-24" /></FormField>
            <FormField label="Late after (min)" htmlFor="pol-late"><Input id="pol-late" name="late" type="number" defaultValue={15} className="sm:w-28" /></FormField>
            <Button variant="outline" type="submit" className="h-12">Create policy</Button>
          </form>
        )}
      </section>
    </>
  );
}
