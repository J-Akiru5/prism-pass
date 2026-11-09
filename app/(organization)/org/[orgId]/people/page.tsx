"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { Plus, Search, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { PersonAvatar } from "@/components/ui/avatar";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { FormField } from "@/components/ui/form-field";
import { Input, Select } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState, EmptyState } from "@/components/ui-states";

type Person = { id: string; displayName: string; externalId: string | null; status: string; createdAt: string };
type Assignment = { id: string; personId: string; programId: string | null; role: string };
type Program = { id: string; name: string; kind: string };
type PassRow = { id: string; passPublicId: string; version: number; status: string; expiresAt: string | null };
type ImportResult = { demo?: boolean; created: number; skipped: number; invalid: number; errors: { row: number; message: string }[] };

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `Request failed (${r.status})`);
  return j.data;
}

export default function PeoplePage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [extId, setExtId] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<(Person & { passes: PassRow[]; assignments: Assignment[] }) | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [progName, setProgName] = useState("");
  const [progKind, setProgKind] = useState("intern");
  const [assignProgram, setAssignProgram] = useState("");
  const [assignRole, setAssignRole] = useState("participant");
  const [issued, setIssued] = useState<{ passPublicId: string; qrPayload: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPeople(await api(`/api/v1/orgs/${orgId}/people?page=1&pageSize=100`));
      setError(null);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [orgId]);
  const loadPrograms = useCallback(async () => {
    try { setPrograms(await api(`/api/v1/orgs/${orgId}/programs?page=1&pageSize=100`)); } catch { /* scoped roles may not list */ }
  }, [orgId]);

  useEffect(() => { load(); loadPrograms(); }, [load, loadPrograms]);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/people`, { method: "POST", body: JSON.stringify({ displayName: name, externalId: extId || undefined }) });
      setName(""); setExtId(""); setAdding(false); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true); setError(null); setImportResult(null);
    try {
      const result = await api(`/api/v1/orgs/${orgId}/people/import`, {
        method: "POST",
        body: JSON.stringify({ csv: await file.text() }),
      }) as ImportResult;
      setImportResult(result);
      if (result.created > 0) await load();
    } catch (err) { setError((err as Error).message); } finally { setImporting(false); }
  }

  async function open(id: string) {
    setIssued(null);
    try { setSelected(await api(`/api/v1/orgs/${orgId}/people/${id}`)); } catch (e) { setError((e as Error).message); }
  }

  async function setStatus(status: "active" | "inactive") {
    if (!selected) return;
    try {
      const updated = await api(`/api/v1/orgs/${orgId}/people/${selected.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setSelected({ ...selected, status: updated.status }); await load();
    } catch (e) { setError((e as Error).message); }
  }

  async function createProgram(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/programs`, { method: "POST", body: JSON.stringify({ name: progName, kind: progKind }) });
      setProgName(""); await loadPrograms();
    } catch (e) { setError((e as Error).message); }
  }

  async function assign(e: React.FormEvent) {
    e.preventDefault(); if (!selected) return;
    try {
      await api(`/api/v1/orgs/${orgId}/assignments`, { method: "POST", body: JSON.stringify({ personId: selected.id, programId: assignProgram || undefined, role: assignRole }) });
      setSelected(await api(`/api/v1/orgs/${orgId}/people/${selected.id}`));
    } catch (e) { setError((e as Error).message); }
  }

  async function issuePass() {
    if (!selected) return;
    try {
      const j = await api(`/api/v1/orgs/${orgId}/passes`, { method: "POST", body: JSON.stringify({ personId: selected.id }) });
      setIssued({ passPublicId: j.pass.passPublicId, qrPayload: j.qrPayload });
      setSelected(await api(`/api/v1/orgs/${orgId}/people/${selected.id}`));
    } catch (e) { setError((e as Error).message); }
  }

  const filtered = people.filter((p) => !q || p.displayName.toLowerCase().includes(q.toLowerCase()) || (p.externalId ?? "").toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader
        title="People"
        description={loading ? "Loading your people directory…" : `${people.length} ${people.length === 1 ? "person" : "people"} in your directory. Everyone here can be issued a pass.`}
        actions={
          <>
            <Button type="button" variant="default" size="lg" className="h-12 w-full sm:w-auto" onClick={() => setAdding((v) => !v)}>
              <Plus aria-hidden="true" /> {adding ? "Close form" : "Add a person"}
            </Button>
            <Button type="button" variant="outline" size="lg" className="h-12 w-full sm:w-auto" disabled={importing} onClick={() => fileInputRef.current?.click()}>
              <Upload aria-hidden="true" /> {importing ? "Importing…" : "Import CSV"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-label="Choose a CSV file of people"
              onChange={importCsv}
            />
          </>
        }
      />
      {error && <div className="mt-4"><ErrorState message={error} retry={load} /></div>}

      {importResult && (
        <div role="status" aria-live="polite" className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="text-[15px] font-semibold text-slate-900">
            {importResult.demo ? "CSV checked in demo mode — nothing was saved." : `Imported ${importResult.created} ${importResult.created === 1 ? "person" : "people"}.`}
            {importResult.skipped > 0 && ` Skipped ${importResult.skipped} duplicate ${importResult.skipped === 1 ? "row" : "rows"}.`}
            {importResult.invalid > 0 && ` ${importResult.invalid} ${importResult.invalid === 1 ? "row needs" : "rows need"} attention.`}
          </p>
          {importResult.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-[14px] text-red-700">
              {importResult.errors.slice(0, 5).map((rowError) => (
                <li key={`${rowError.row}:${rowError.message}`}>Row {rowError.row}: {rowError.message}</li>
              ))}
            </ul>
          )}
          {importResult.errors.length > 5 && (
            <p className="mt-1 text-[14px] text-slate-600">…and {importResult.errors.length - 5} more row errors.</p>
          )}
          <p className="mt-2 text-[13.5px] text-slate-500">
            CSV headers: name (or display_name / full_name), plus optional external_id (or staff_id / id).
          </p>
        </div>
      )}

      {adding && (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle>New person</CardTitle>
            <CardDescription>A name is enough. The external ID is optional.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={create} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <FormField label="Full name" htmlFor="p-name"><Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Alex Cruz" autoComplete="off" /></FormField>
              <FormField label="External ID (optional)" htmlFor="p-ext"><Input id="p-ext" value={extId} onChange={(e) => setExtId(e.target.value)} placeholder="e.g. EMP-1042" /></FormField>
              <Button disabled={busy} type="submit" className="h-12 sm:mb-0">{busy ? "Adding…" : "Add person"}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <section className="mt-5" aria-label="Directory">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name or ID" aria-label="Search people" className="h-12 pl-11 pr-11" />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
              <X className="size-5" aria-hidden="true" />
            </button>
          )}
        </div>
        <p role="status" className="mt-2 text-[15px] text-slate-600">
          {loading ? "Loading…" : q ? `${filtered.length} match${filtered.length === 1 ? "" : "es"}` : `Showing ${filtered.length} of ${people.length}`}
        </p>

        <div className="mt-3">
          {loading ? <LoadingState label="Loading people…" /> : filtered.length === 0 ? (
            <EmptyState
              title={q ? "No one matches" : "No people yet"}
              description={q ? "Try a shorter search." : "Import a CSV or tap Add a person to get started."}
              action={q ? <Button variant="outline" onClick={() => setQ("")}>Clear search</Button> : undefined}
            />
          ) : (
            <DataTable columns={["Person", "Staff ID", "Status", { label: "Actions", srOnly: true }]} caption="People directory">
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell primary>
                    <span className="flex items-center gap-3">
                      <PersonAvatar name={p.displayName} size="sm" />
                      <span className="font-semibold">{p.displayName}</span>
                    </span>
                  </TableCell>
                  <TableCell label="Staff ID" mono>{p.externalId ?? "—"}</TableCell>
                  <TableCell label="Status"><Badge variant={p.status === "active" ? "success" : "muted"}>{p.status}</Badge></TableCell>
                  <TableCell actions>
                    <Button variant="outline" size="sm" aria-label={`Open ${p.displayName}`} onClick={() => open(p.id)}>Open <span aria-hidden="true">→</span></Button>
                  </TableCell>
                </TableRow>
              ))}
            </DataTable>
          )}
        </div>
      </section>

      {selected && (
        <Card className="mt-5">
          <CardHeader>
            <div className="flex items-start gap-3">
              <PersonAvatar name={selected.displayName} />
              <div className="min-w-0 flex-1">
                <CardTitle>{selected.displayName}</CardTitle>
                <CardDescription>
                  {selected.externalId ?? "No staff ID"} · added {new Date(selected.createdAt).toLocaleDateString()}
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" aria-label="Close member detail" onClick={() => setSelected(null)}><X aria-hidden="true" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={selected.status === "active" ? "success" : "muted"}>{selected.status}</Badge>
              <Button variant="outline" size="sm" onClick={() => setStatus(selected.status === "active" ? "inactive" : "active")}>
                {selected.status === "active" ? "Deactivate" : "Activate"}
              </Button>
              <Button variant="default" size="sm" onClick={issuePass}>Issue a pass</Button>
            </div>

            {issued && (
              <div role="status" className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                <p className="text-[15px] font-bold text-slate-900">New credential — copy it now, it is shown once.</p>
                <p className="mt-1 break-all font-mono text-[13px] leading-relaxed">{issued.qrPayload}</p>
              </div>
            )}

            <h3 className="mt-5 text-[15px] font-bold text-slate-900">Programs ({selected.assignments.length})</h3>
            <ul className="mt-2 space-y-2">
              {selected.assignments.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[15px]">
                  <span className="font-medium text-slate-900">{programs.find((p) => p.id === a.programId)?.name ?? "Direct"}</span>
                  <Badge variant="muted">{a.role}</Badge>
                </li>
              ))}
              {selected.assignments.length === 0 && <li className="text-[15px] text-slate-600">None yet — add one below.</li>}
            </ul>
            <form onSubmit={assign} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Select value={assignProgram} onChange={(e) => setAssignProgram(e.target.value)} aria-label="Program">
                <option value="">Direct (no program)</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.kind})</option>)}
              </Select>
              <Input value={assignRole} onChange={(e) => setAssignRole(e.target.value)} aria-label="Role" placeholder="role" className="sm:w-32" />
              <Button variant="outline" type="submit" className="h-12">Assign</Button>
            </form>

            <h3 className="mt-5 text-[15px] font-bold text-slate-900">Passes ({selected.passes.length})</h3>
            <ul className="mt-2 space-y-2">
              {selected.passes.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[15px]">
                  <span className="min-w-0 flex-1 truncate font-mono text-[13.5px]">{p.passPublicId}</span>
                  <span className="text-slate-600">v{p.version}</span>
                  <Badge variant={p.status === "ACTIVE" ? "success" : "danger"}>{p.status}</Badge>
                </li>
              ))}
              {selected.passes.length === 0 && <li className="text-[15px] text-slate-600">No passes issued.</li>}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Programs ({programs.length})</CardTitle>
          <CardDescription>Groups such as interns, employees, or event cohorts.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {programs.map((p) => <Badge key={p.id} variant="info">{p.name} · {p.kind}</Badge>)}
            {programs.length === 0 && <p className="text-[15px] text-slate-600">None yet.</p>}
          </div>
          <form onSubmit={createProgram} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <FormField label="Program name" htmlFor="prog-name"><Input id="prog-name" value={progName} onChange={(e) => setProgName(e.target.value)} required placeholder="e.g. OJT Batch 2026" /></FormField>
            <FormField label="Kind" htmlFor="prog-kind">
              <Select id="prog-kind" value={progKind} onChange={(e) => setProgKind(e.target.value)}>
                {["employee", "intern", "event", "class", "visitor", "training"].map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
            </FormField>
            <Button type="submit" variant="outline" className="h-12">Create program</Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
