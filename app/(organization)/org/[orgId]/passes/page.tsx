"use client";

import { use, useCallback, useEffect, useState } from "react";
import { IdCard, RotateCw, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DigitalPassCard, type PassInfo } from "@/components/digital-pass-card";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { ErrorState, EmptyState } from "@/components/ui-states";
import { TableSkeleton } from "@/components/ui/skeleton";

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `Request failed (${r.status})`);
  return j.data;
}

export default function PassesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const [passes, setPasses] = useState<(PassInfo & { personId: string; createdAt: string })[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printPass, setPrintPass] = useState<(typeof passes)[number] | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; kind: "revoke" | "rotate"; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPasses(await api(`/api/v1/orgs/${orgId}/passes?page=1&pageSize=100`));
      const people = await api(`/api/v1/orgs/${orgId}/people?page=1&pageSize=100`).catch(() => []);
      const map: Record<string, string> = {};
      for (const p of people as { id: string; displayName: string }[]) map[p.id] = p.displayName;
      setNames(map);
      setError(null);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  async function act() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === "revoke") {
        await api(`/api/v1/orgs/${orgId}/passes/${confirm.id}/revoke`, { method: "POST" });
        setNotice("Pass revoked. That QR no longer verifies.");
      } else {
        const j = await api(`/api/v1/orgs/${orgId}/passes/${confirm.id}/rotate`, { method: "POST" });
        setNotice(`Rotated to version ${j.pass.version}. New credential (shown once): ${j.qrPayload}`);
      }
      setConfirm(null);
      await load();
    } catch (e) { setError((e as Error).message); setConfirm(null); } finally { setBusy(false); }
  }

  const active = passes.filter((p) => p.status === "ACTIVE").length;
  const who = (id: string) => names[id] ?? `Member ${id.slice(0, 8)}`;

  return (
    <>
      <PageHeader
        title="Passes"
        description={loading ? "Loading the passes issued by your organization…" : `${active} active of ${passes.length} issued. A pass is the QR a person shows to check in.`}
      />
      {error && <div className="mt-4"><ErrorState message={error} retry={load} /></div>}
      {notice && (
        <div role="status" className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[15px] text-slate-900">
          <p className="font-semibold">Done</p>
          <p className="mt-1 break-all text-[14px] leading-relaxed">{notice}</p>
        </div>
      )}

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Issued passes</CardTitle>
          <CardDescription>Revoking takes effect instantly — the old QR stops working.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? <div className="p-4"><TableSkeleton rows={4} /></div> : passes.length === 0 ? (
            <div className="p-5"><EmptyState title="No passes yet" description="Issue one from the People directory." /></div>
          ) : (
            <DataTable columns={["Pass", "Person", "Version", "Status", { label: "Actions", srOnly: true }]} caption="Digital identity passes">
              {passes.map((p) => (
                <TableRow key={p.id}>
                  <TableCell label="Pass" mono primary className="break-all">{p.passPublicId}</TableCell>
                  <TableCell label="Person">{who(p.personId)}</TableCell>
                  <TableCell label="Version" mono>v{p.version}</TableCell>
                  <TableCell label="Status"><Badge variant={p.status === "ACTIVE" ? "success" : "danger"}>{p.status}</Badge></TableCell>
                  <TableCell actions>
                    <Button variant="outline" size="sm" aria-label={`ID card for ${p.passPublicId}`} onClick={() => setPrintPass(p)}><IdCard aria-hidden="true" /> ID card</Button>
                    <Button variant="outline" size="sm" aria-label={`Rotate pass ${p.passPublicId}`} onClick={() => setConfirm({ id: p.id, kind: "rotate", label: p.passPublicId })}><RotateCw aria-hidden="true" /> Rotate</Button>
                    <Button variant="outline" size="sm" aria-label={`Revoke pass ${p.passPublicId}`} onClick={() => setConfirm({ id: p.id, kind: "revoke", label: p.passPublicId })} className="text-red-600 hover:text-red-700"><Ban aria-hidden="true" /> Revoke</Button>
                  </TableCell>
                </TableRow>
              ))}
            </DataTable>
          )}
        </CardContent>
      </Card>

      {printPass && (
        <div className="mt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[21px] font-semibold tracking-[-0.02em] text-slate-900">ID card</h2>
              <p className="mt-1 font-mono text-[13px] text-slate-500">{printPass.passPublicId}</p>
            </div>
            <Button variant="outline" onClick={() => setPrintPass(null)}>Close</Button>
          </div>
          <p className="pp-lead mt-2 max-w-2xl">
            This card identifies the pass. The live QR credential is shown only once, at issuance — rotate to issue a new one.
          </p>
          <div className="mt-4 w-full max-w-sm">
            <DigitalPassCard
              personName={who(printPass.personId)}
              orgName="Prism Pass"
              pass={printPass}
              qrValue={`PRISM1:${printPass.passPublicId}:PENDING-PROVISIONING`}
              showPrint
            />
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmationDialog
          title={confirm.kind === "revoke" ? "Revoke this pass?" : "Rotate this credential?"}
          body={confirm.kind === "revoke"
            ? "The QR stops verifying immediately. The holder needs a new pass to check in again."
            : "A new secret is created and the version goes up. The old QR stops working immediately."}
          confirmLabel={confirm.kind === "revoke" ? "Revoke pass" : "Rotate credential"}
          tone={confirm.kind === "revoke" ? "destructive" : "default"}
          busy={busy}
          onConfirm={act}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}
