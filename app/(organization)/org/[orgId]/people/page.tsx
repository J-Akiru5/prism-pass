"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Plus, Search, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { PersonAvatar } from "@/components/ui/avatar";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState, EmptyState } from "@/components/ui-states";

type Person = { id: string; displayName: string; externalId: string | null; status: string; createdAt: string };
type Assignment = { id: string; personId: string; programId: string | null; role: string };
type Program = { id: string; name: string; kind: string };
type PassRow = { id: string; passPublicId: string; version: number; status: string; expiresAt: string | null };

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `Request failed (${r.status})`);
  return j.data;
}

export default function PeoplePage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const [people, setPeople] = useState<Person[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [extId, setExtId] = useState("");
  const [busy, setBusy] = useState(false);
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
      const j = await api(`/api/v1/orgs/${orgId}/people?page=1&pageSize=100`);
      setPeople(j);
      setTotal(j.length);
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
      setName(""); setExtId(""); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
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
        title="People directory"
        description="One directory for employees, interns, and participants. Group identity comes from program assignments."
        eyebrow={`Directory · ${total} members`}
        actions={<span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><UserPlus className="size-4" aria-hidden="true" />{total} total</span>}
      />
      {error && <div className="mt-4"><ErrorState message={error} retry={load} /></div>}

      <div className="mt-6 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>Search by name or external ID. Select a row for detail.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or external ID…" aria-label="Search people" className="pl-9" />
            </div>
            <p role="status" className="sr-only">{q ? `${filtered.length} matching members.` : ""}</p>
            {loading ? <LoadingState label="Loading directory…" /> : filtered.length === 0 ? (
              <EmptyState title={q ? "No matches" : "No people yet"} description={q ? "Try a different search." : "Add the first member with the form below."} />
            ) : (
              <DataTable columns={["Member", "External ID", "Status", { label: "Actions", srOnly: true }]} caption="People directory">
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <span className="flex items-center gap-2.5">
                        <PersonAvatar name={p.displayName} size="sm" />
                        <span className="font-medium">{p.displayName}</span>
                      </span>
                    </TableCell>
                    <TableCell mono>{p.externalId ?? "—"}</TableCell>
                    <TableCell><Badge variant={p.status === "active" ? "success" : "muted"}>{p.status}</Badge></TableCell>
                    <TableCell><Button variant="ghost" size="sm" aria-label={`Open ${p.displayName}`} onClick={() => open(p.id)}>Open</Button></TableCell>
                  </TableRow>
                ))}
              </DataTable>
            )}
            <form onSubmit={create} className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-[1fr_1fr_auto]">
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Display name" aria-label="Display name" />
              <Input value={extId} onChange={(e) => setExtId(e.target.value)} placeholder="External ID (optional)" aria-label="External ID" />
              <Button disabled={busy} type="submit"><Plus aria-hidden="true" /> {busy ? "Adding…" : "Add"}</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{selected ? selected.displayName : "Member detail"}</CardTitle>
            <CardDescription>{selected ? `Member since ${new Date(selected.createdAt).toLocaleDateString()}` : "Select a member to see assignments and passes."}</CardDescription>
          </CardHeader>
          <CardContent>
            {!selected ? <EmptyState title="Nothing selected" description="Choose a member from the directory." /> : (
              <div>
                <div className="flex items-center gap-3">
                  <PersonAvatar name={selected.displayName} />
                  <div>
                    <p className="font-semibold leading-tight">{selected.displayName}</p>
                    <p className="font-mono text-xs text-muted-foreground">{selected.externalId ?? "no external ID"}</p>
                  </div>
                  <span className="ml-auto"><Badge variant={selected.status === "active" ? "success" : "muted"}>{selected.status}</Badge></span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStatus("inactive")}>Deactivate</Button>
                  <Button variant="outline" size="sm" onClick={() => setStatus("active")}>Activate</Button>
                  <Button variant="gold" size="sm" onClick={issuePass}>Issue pass</Button>
                </div>
                {issued && (
                  <div role="status" className="mt-3 rounded-xl border-l-4 border-accent bg-accent/10 px-4 py-3 text-sm">
                    <p className="font-bold">One-time credential — copy now, it is never shown again.</p>
                    <p className="mt-1 break-all font-mono text-xs">{issued.qrPayload}</p>
                  </div>
                )}
                <h3 className="mt-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Assignments ({selected.assignments.length})</h3>
                <ul className="mt-1.5 space-y-1.5 text-sm">
                  {selected.assignments.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5">
                      <span className="font-medium">{programs.find((p) => p.id === a.programId)?.name ?? "Direct"}</span>
                      <Badge variant="muted">{a.role}</Badge>
                    </li>
                  ))}
                  {selected.assignments.length === 0 && <li className="text-muted-foreground">None — assign to a program below.</li>}
                </ul>
                <form onSubmit={assign} className="mt-2 flex gap-2">
                  <select value={assignProgram} onChange={(e) => setAssignProgram(e.target.value)} aria-label="Program" className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-card px-2 text-sm">
                    <option value="">Direct (no program)</option>
                    {programs.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.kind})</option>)}
                  </select>
                  <Input value={assignRole} onChange={(e) => setAssignRole(e.target.value)} aria-label="Role" placeholder="role" className="w-28" />
                  <Button variant="outline" size="sm" className="h-10">Assign</Button>
                </form>
                <h3 className="mt-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Passes ({selected.passes.length})</h3>
                <ul className="mt-1.5 space-y-1.5 text-sm">
                  {selected.passes.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5">
                      <span className="truncate font-mono text-xs">{p.passPublicId}</span>
                      <span className="text-muted-foreground">v{p.version}</span>
                      <span className="ml-auto"><Badge variant={p.status === "ACTIVE" ? "success" : "danger"}>{p.status}</Badge></span>
                    </li>
                  ))}
                  {selected.passes.length === 0 && <li className="text-muted-foreground">No passes issued.</li>}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Programs ({programs.length})</CardTitle>
          <CardDescription>Employees, interns, and event cohorts share one directory — programs distinguish them.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {programs.map((p) => <Badge key={p.id} variant="info">{p.name} · {p.kind}</Badge>)}
            {programs.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
          </div>
          <form onSubmit={createProgram} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="flex-1"><FormField label="Program name" htmlFor="prog-name"><Input id="prog-name" value={progName} onChange={(e) => setProgName(e.target.value)} required placeholder="e.g. OJT Batch 2026" /></FormField></div>
            <div>
              <FormField label="Kind" htmlFor="prog-kind">
                <select id="prog-kind" value={progKind} onChange={(e) => setProgKind(e.target.value)} className="h-10 rounded-lg border border-input bg-card px-3 text-sm">
                  {["employee", "intern", "event", "class", "visitor", "training"].map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </FormField>
            </div>
            <Button type="submit" variant="outline" className="self-end">Create</Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
