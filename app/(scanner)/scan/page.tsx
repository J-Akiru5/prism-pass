"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Keyboard, ScanLine } from "lucide-react";
import { ScannerViewport } from "@/components/scanner-viewport";
import { ScanResult, type ScanTone } from "@/components/scan-result";
import { ConsoleBar } from "@/components/console-bar";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { useOrgs } from "@/lib/use-orgs";

type SessionOption = { id: string; title: string; type: string; startsAt: string };
type Outcome = { tone: ScanTone; title: string; message: string; at: string };

function classify(code: number, message: string): ScanTone {
  if (code === 200) return "success";
  if (message.includes("duplicate") || message.includes("DUPLICATE")) return "warning";
  if (code === 401 || code === 403) return "danger";
  if (code === 404 || code === 400) return "info";
  if (code === 410) return "warning";
  return "muted";
}

// Scanner: the organization comes from your verified membership, not a pasted
// UUID. Verification works without a session; recording check-in/out needs one.
export default function ScanPage() {
  const { orgs, loading: orgsLoading, error: orgsError } = useOrgs();
  const [orgId, setOrgId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [cred, setCred] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Outcome | null>(null);
  const [history, setHistory] = useState<Outcome[]>([]);

  // Preselect: ?org= from the URL, else the only/first organization.
  useEffect(() => {
    if (orgId || orgs.length === 0) return;
    const fromUrl = new URLSearchParams(window.location.search).get("org");
    const match = fromUrl ? orgs.find((o) => o.id === fromUrl) : undefined;
    setOrgId(match?.id ?? orgs[0].id);
  }, [orgs, orgId]);

  useEffect(() => {
    if (!orgId) return;
    let alive = true;
    setSessionsLoading(true);
    setSessionId("");
    fetch(`/api/v1/orgs/${orgId}/sessions?page=1&pageSize=50`, { credentials: "include" })
      .then(async (r) => (r.ok ? (await r.json()).data ?? [] : []))
      .then((list) => {
        if (alive) setSessions(list as SessionOption[]);
      })
      .catch(() => {
        if (alive) setSessions([]);
      })
      .finally(() => {
        if (alive) setSessionsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [orgId]);

  const org = useMemo(() => orgs.find((o) => o.id === orgId), [orgs, orgId]);
  const activeSession = sessions.find((s) => s.id === sessionId);

  const submit = useCallback(
    async (raw?: string) => {
      const credential = (raw ?? cred).trim();
      if (!credential || !orgId) {
        const outcome: Outcome = {
          tone: "info",
          title: "Nothing to verify",
          message: "Enter a credential, or scan a pass with the camera.",
          at: new Date().toISOString(),
        };
        setResult(outcome);
        return;
      }
      setBusy(true);
      setResult({ tone: "muted", title: "Verifying", message: "Checking credential against the server…", at: new Date().toISOString() });
      try {
        const v = await fetch(`/api/v1/orgs/${orgId}/passes/verify`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ credential }),
        });
        const vj = await v.json();
        if (!v.ok) {
          const outcome: Outcome = {
            tone: classify(v.status, vj?.error?.code ?? ""),
            title: vj?.error?.code ?? `Error ${v.status}`,
            message: vj?.error?.message ?? "Credential rejected.",
            at: new Date().toISOString(),
          };
          setResult(outcome);
          setHistory((h) => [outcome, ...h].slice(0, 5));
          return;
        }
        if (!sessionId) {
          const outcome: Outcome = {
            tone: "success",
            title: vj.data.reason ?? "VALID",
            message: "Pass is valid. Pick a session to record check-in or check-out.",
            at: new Date().toISOString(),
          };
          setResult(outcome);
          setHistory((h) => [outcome, ...h].slice(0, 5));
          return;
        }
        const s = await fetch(`/api/v1/orgs/${orgId}/sessions/${sessionId}/scans`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ credential, clientTs: new Date().toISOString() }),
        });
        const sj = await s.json();
        if (!s.ok) {
          const outcome: Outcome = {
            tone: classify(s.status, sj?.error?.code ?? ""),
            title: sj?.error?.code ?? `Error ${s.status}`,
            message: sj?.error?.message ?? "Scan rejected.",
            at: new Date().toISOString(),
          };
          setResult(outcome);
          setHistory((h) => [outcome, ...h].slice(0, 5));
          return;
        }
        const outcome: Outcome = {
          tone: sj.data.duplicate ? "warning" : "success",
          title: sj.data.duplicate ? "Duplicate scan" : sj.data.event.type === "CHECK_IN" ? "Checked in" : "Checked out",
          message: `${sj.data.record?.status ?? "Recorded"}${
            sj.data.duplicate ? " — already counted, not recorded twice." : `. Geo: ${sj.data.geoResult ?? "not captured"}.`
          }`,
          at: new Date().toISOString(),
        };
        setResult(outcome);
        setHistory((h) => [outcome, ...h].slice(0, 5));
      } catch (e) {
        const outcome: Outcome = { tone: "danger", title: "Network error", message: (e as Error).message, at: new Date().toISOString() };
        setResult(outcome);
        setHistory((h) => [outcome, ...h].slice(0, 5));
      } finally {
        setBusy(false);
      }
    },
    [cred, orgId, sessionId]
  );

  return (
    <div className="min-h-dvh bg-background">
      <ConsoleBar label="Scanner" orgHref={orgId ? `/org/${orgId}` : undefined} />
      <main className="mx-auto max-w-xl px-4 pb-16 pt-8 md:px-6">
        <PageHeader
          title="Scanner"
          description="Point the camera at a pass, or paste the payload. Verification is server-side and authoritative."
          eyebrow="Check-in"
        />

        {orgsLoading && <p className="mt-6 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Loading organizations…</p>}

        {!orgsLoading && orgsError && (
          <div className="mt-6 border-y py-4 text-sm">
            <p className="font-medium">Could not load your organizations</p>
            <p className="mt-1 text-muted-foreground">{orgsError}</p>
            <Link href="/login?next=/scan" className="mt-2 inline-block underline underline-offset-4">Sign in again</Link>
          </div>
        )}

        {!orgsLoading && !orgsError && orgs.length === 0 && (
          <div className="mt-6 border-y py-4 text-sm">
            <p className="font-medium">No organization yet</p>
            <p className="mt-1 text-muted-foreground">Your account has no active membership, so there is nothing to scan into.</p>
          </div>
        )}

        {orgs.length > 0 && (
          <>
            <section className="mt-8 border-y">
              <dl className="divide-y">
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Organization</dt>
                  <dd className="min-w-0 flex-1 text-right">
                    {orgs.length === 1 ? (
                      <span className="text-sm">{orgs[0].name}</span>
                    ) : (
                      <select
                        aria-label="Organization"
                        value={orgId}
                        onChange={(e) => setOrgId(e.target.value)}
                        className="h-9 max-w-full rounded-md border border-input bg-card px-2 text-sm"
                      >
                        {orgs.map((o) => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Session</dt>
                  <dd className="min-w-0 flex-1 text-right">
                    <select
                      aria-label="Session"
                      value={sessionId}
                      onChange={(e) => setSessionId(e.target.value)}
                      disabled={sessionsLoading}
                      className="h-9 max-w-full rounded-md border border-input bg-card px-2 text-sm"
                    >
                      <option value="">Verify only — do not record</option>
                      {sessions.map((s) => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                    </select>
                  </dd>
                </div>
              </dl>
              <p className="pb-3 text-xs text-muted-foreground">
                {activeSession
                  ? `Recording into “${activeSession.title}”.`
                  : "Verification only. Choose a session to write attendance."}
              </p>
            </section>

            <div className="mt-6">
              <ScannerViewport
                onDecode={(d) => {
                  setCred(d);
                  submit(d);
                }}
              />
            </div>

            <section className="mt-8">
              <div className="flex items-baseline justify-between border-b pb-2">
                <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  <Keyboard className="size-3.5" aria-hidden="true" /> Manual entry
                </h2>
                <span className="text-xs text-muted-foreground">No camera required</span>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
                className="mt-3 flex gap-2"
              >
                <Input
                  value={cred}
                  onChange={(e) => setCred(e.target.value)}
                  placeholder="PRISM1:passPublicId:secret"
                  aria-label="Credential payload"
                  className="font-mono text-xs"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button type="submit" variant="gold" disabled={busy}>
                  <ScanLine aria-hidden="true" /> {busy ? "Working…" : "Verify"}
                </Button>
              </form>
            </section>

            {result && (
              <div className="mt-6">
                <ScanResult tone={result.tone} title={result.title} message={result.message} assertive={result.tone === "danger"} />
              </div>
            )}

            {history.length > 1 && (
              <section className="mt-8">
                <h2 className="border-b pb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">This session</h2>
                <ul className="mt-1">
                  {history.slice(1).map((h, i) => (
                    <li key={`${h.at}-${i}`} className="flex items-baseline justify-between gap-4 border-b py-2 text-sm last:border-b-0">
                      <span className="truncate">{h.title}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {new Date(h.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
