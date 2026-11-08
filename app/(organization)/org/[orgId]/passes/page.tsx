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
import { ErrorState, LoadingState, EmptyState } from "@/components/ui-states";

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `Request failed (${r.status})`);
  return j.data;
}

export default function PassesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const [passes, setPasses] = useState<(PassInfo & { personId: string; createdAt: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printPass, setPrintPass] = useState<(typeof passes)[number] | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; kind: "revoke" | "rotate" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPasses(await api(`/api/v1/orgs/${orgId}/passes?page=1&pageSize=100`));
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
        setNotice("Pass revoked. The QR no longer verifies.");
      } else {
        const j = await api(`/api/v1/orgs/${orgId}/passes/${confirm.id}/rotate`, { method: "POST" });
        setNotice(`Rotated to v${j.pass.version}. New credential (show once): ${j.qrPayload}`);
      }
      setConfirm(null);
      await load();
    } catch (e) { setError((e as Error).message); setConfirm(null); } finally { setBusy(false); }
  }

  const active = passes.filter((p) => p.status === "ACTIVE").length;

  return (
    <>
      <PageHeader
        title="Digital identity passes"
        description="Issue from the People directory. QR holds an opaque credential only — no personal data (ADR-07)."
        eyebrow={`Passes · ${active} active / ${passes.length} issued`}
      />
      {error && <div className="mt-4"><ErrorState message={error} retry={load} /></div>}
      {notice && <div role="status" className="mt-4 break-all rounded-xl border-l-4 border-info bg-info/10 px-4 py-3 font-mono text-sm">{notice}</div>}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>All passes</CardTitle>
          <CardDescription>Credential hashes are never exposed. Revocation takes effect immediately.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? <div className="p-5"><LoadingState label="Loading passes…" /></div> : passes.length === 0 ? (
            <div className="p-5"><EmptyState title="No passes yet" description="Issue one from the People directory." /></div>
          ) : (
            <DataTable columns={["Public ID", "Person", "Ver", "Status", "Actions"]} caption="Digital identity passes">
              {passes.map((p) => (
                <TableRow key={p.id}>
                  <TableCell mono>{p.passPublicId}</TableCell>
                  <TableCell mono>{p.personId.slice(0, 8)}…</TableCell>
                  <TableCell mono>v{p.version}</TableCell>
                  <TableCell><Badge variant={p.status === "ACTIVE" ? "success" : "danger"}>{p.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1.5">
                      <Button variant="ghost" size="sm" aria-label={`ID card for ${p.passPublicId}`} onClick={() => setPrintPass(p)}><IdCard aria-hidden="true" /> ID card</Button>
                      <Button variant="ghost" size="sm" aria-label={`Rotate pass ${p.passPublicId}`} onClick={() => setConfirm({ id: p.id, kind: "rotate" })}><RotateCw aria-hidden="true" /> Rotate</Button>
                      <Button variant="ghost" size="sm" aria-label={`Revoke pass ${p.passPublicId}`} onClick={() => setConfirm({ id: p.id, kind: "revoke" })} className="text-destructive hover:text-destructive"><Ban aria-hidden="true" /> Revoke</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </DataTable>
          )}
        </CardContent>
      </Card>

      {printPass && (
        <div className="mt-6">
          <PageHeader as="h2" title={`ID card — ${printPass.passPublicId}`} eyebrow="Printable" actions={<Button variant="outline" size="sm" onClick={() => setPrintPass(null)}>Close</Button>} />
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            The live QR credential is shown only at issuance. This card identifies the pass; rotate to provision a new device-held credential.
          </p>
          <div className="mt-4 max-w-sm">
            <DigitalPassCard
              personName={`Member ${printPass.personId.slice(0, 8)}`}
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
            ? "The QR stops verifying immediately. The holder must be issued a new pass to check in again."
            : "A new secret is generated (version increments). The old QR stops working immediately."}
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
