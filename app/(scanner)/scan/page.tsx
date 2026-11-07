"use client";

import { useState } from "react";
import { ScanLine, Keyboard } from "lucide-react";
import { ScannerViewport } from "@/components/scanner-viewport";
import { ScanResult, type ScanTone } from "@/components/scan-result";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Browser scanner: camera decode via shared ScannerViewport + manual fallback,
// wired to Prism Pass server verify + canonical scan endpoint. Outcomes use the
// tiered banner language (success / duplicate / invalid / expired / revoked /
// unauthorized). Server reconciliation is authoritative.
export default function ScanPage() {
  const [orgId, setOrgId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [sessions, setSessions] = useState<{ id: string; title: string; type: string }[]>([]);
  const [cred, setCred] = useState("");
  const [result, setResult] = useState<{ tone: ScanTone; title: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadSessions(org: string) {
    if (!org) return;
    try {
      const r = await fetch(`/api/v1/orgs/${org}/sessions?page=1&pageSize=50`);
      const j = await r.json();
      if (r.ok) setSessions(j.data);
    } catch { /* unauthenticated — manual flow still surfaces verify errors */ }
  }

  function classify(code: number, message: string): ScanTone {
    if (code === 200) return "success";
    if (message.includes("duplicate") || message.includes("DUPLICATE")) return "warning";
    if (code === 401 || code === 403) return "danger";
    if (code === 404 || code === 400) return "info";
    if (code === 410) return "warning";
    return "muted";
  }

  async function submit(raw?: string) {
    const credential = (raw ?? cred).trim();
    if (!credential || !orgId) {
      setResult({ tone: "info", title: "Missing details", message: "Enter the organization ID and a credential first." });
      return;
    }
    setBusy(true);
    setResult({ tone: "muted", title: "Working", message: "Verifying credential…" });
    try {
      const v = await fetch(`/api/v1/orgs/${orgId}/passes/verify`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential }),
      });
      const vj = await v.json();
      if (!v.ok) {
        setResult({ tone: classify(v.status, vj?.error?.code ?? ""), title: vj?.error?.code ?? `Error ${v.status}`, message: vj?.error?.message ?? "Credential rejected." });
        return;
      }
      if (!sessionId) {
        setResult({ tone: "success", title: vj.data.reason, message: "Credential is valid. Select a session to record check-in." });
        return;
      }
      const s = await fetch(`/api/v1/orgs/${orgId}/sessions/${sessionId}/scans`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential, clientTs: new Date().toISOString() }),
      });
      const sj = await s.json();
      if (!s.ok) {
        setResult({ tone: classify(s.status, sj?.error?.code ?? ""), title: sj?.error?.code ?? `Error ${s.status}`, message: sj?.error?.message ?? "Scan rejected." });
        return;
      }
      setResult({
        tone: sj.data.duplicate ? "warning" : "success",
        title: sj.data.duplicate ? "Duplicate scan" : sj.data.event.type === "CHECK_IN" ? "Checked in" : "Checked out",
        message: `${sj.data.record?.status ?? "Recorded"}${sj.data.duplicate ? " — already counted, not recorded twice." : "."}`,
      });
    } catch (e) {
      setResult({ tone: "danger", title: "Network error", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-6 md:px-6 md:py-10">
      <PageHeader
        title="Scanner"
        description="Scoped check-in/out. UI duplicate guard is provisional; server reconciliation authoritative."
        eyebrow="Check-in"
      />

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Session context</CardTitle>
          <CardDescription>A QR token verifies on its own; recording attendance needs a session.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <FormField label="Organization ID" htmlFor="scan-org" hint="The uuid in your /org/… URL.">
            <Input id="scan-org" value={orgId} onChange={(e) => { setOrgId(e.target.value); loadSessions(e.target.value); }} placeholder="e.g. 9dd69c9b-…" className="font-mono" />
          </FormField>
          <FormField label="Session" htmlFor="scan-session">
            <select id="scan-session" value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm">
              <option value="">Verify only (no session)</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.title} ({s.type})</option>)}
            </select>
          </FormField>
        </CardContent>
      </Card>

      <div className="mt-4">
        <ScannerViewport onDecode={(d) => { setCred(d); submit(d); }} />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Keyboard className="size-4" aria-hidden="true" /> Manual fallback</CardTitle>
          <CardDescription>Camera unavailable, or verifying a printed credential.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex gap-2">
            <Input value={cred} onChange={(e) => setCred(e.target.value)} placeholder="PRISM1:…" aria-label="Credential" className="font-mono" />
            <Button type="submit" variant="gold" disabled={busy}><ScanLine aria-hidden="true" /> {busy ? "…" : "Verify + scan"}</Button>
          </form>
        </CardContent>
      </Card>

      {result && <div className="mt-4"><ScanResult tone={result.tone} title={result.title} message={result.message} assertive={result.tone === "danger"} /></div>}
    </main>
  );
}
