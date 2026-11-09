"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarCheck, Download, FileSpreadsheet, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FormField } from "@/components/ui/form-field";
import { Input, Select } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MAX_DTR_RANGE_DAYS, parseDtrRange } from "@/modules/reports/range";

function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type SessionOption = {
  id: string;
  title: string;
  startsAt: string;
};

type SessionListPayload = {
  data?: SessionOption[];
  error?: { message?: string };
};

function sessionDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// Reports hub: the daily time record for a date range, and one file per event.
export default function ReportsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  // Defaults are resolved after mount so server and client markup never disagree
  // about "today" across timezones (a hydration mismatch).
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    setFrom(toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
    setTo(toDateInput(now));
  }, []);

  // Event choices for the per-event report. Reports permission does not imply
  // `attendance.scan`, so a role that cannot read the schedule simply sees the
  // server's message instead of a broken selector.
  useEffect(() => {
    let cancelled = false;
    async function loadSessions() {
      try {
        const response = await fetch(`/api/v1/orgs/${orgId}/sessions?page=1&pageSize=100`);
        const payload = (await response.json().catch(() => null)) as SessionListPayload | null;
        if (!response.ok) {
          throw new Error(payload?.error?.message ?? `Could not load events (${response.status})`);
        }
        if (cancelled) return;
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        setSessions(rows);
        setSessionId((current) => current || rows[0]?.id || "");
        setSessionsError(null);
      } catch (error) {
        if (!cancelled) setSessionsError((error as Error).message);
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    }
    void loadSessions();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const parsed = useMemo(() => (from && to ? parseDtrRange(from, to) : null), [from, to]);
  const href = parsed?.ok
    ? `/api/v1/orgs/${orgId}/reports/dtr?from=${encodeURIComponent(parsed.range.from)}&to=${encodeURIComponent(parsed.range.to)}&format=csv`
    : null;
  const sessionHref = sessionId
    ? `/api/v1/orgs/${orgId}/reports/sessions/${encodeURIComponent(sessionId)}?format=csv`
    : null;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Download attendance as a spreadsheet file your office can open in Excel."
      />

      <Card className="mt-5 max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <FileSpreadsheet className="size-5" aria-hidden="true" />
            </span>
            <CardTitle>Daily time record</CardTitle>
          </div>
          <CardDescription>
            One line per person per day: first in, last out, total hours, status. Up to {MAX_DTR_RANGE_DAYS} days at a time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="From" htmlFor="dtr-from">
              <Input
                id="dtr-from"
                name="from"
                type="date"
                value={from}
                max={to}
                onChange={(event) => setFrom(event.target.value)}
              />
            </FormField>
            <FormField label="To" htmlFor="dtr-to">
              <Input
                id="dtr-to"
                name="to"
                type="date"
                value={to}
                min={from}
                onChange={(event) => setTo(event.target.value)}
              />
            </FormField>
          </div>

          <div className="mt-4">
            {href ? (
              <a href={href} download className={buttonVariants({ variant: "default", size: "lg" }) + " h-12 w-full"}>
                <Download aria-hidden="true" /> Download CSV
              </a>
            ) : (
              <span
                aria-disabled="true"
                className={`${buttonVariants({ variant: "outline", size: "lg" })} pointer-events-none h-12 w-full opacity-50`}
              >
                <Download aria-hidden="true" /> Download CSV
              </span>
            )}
          </div>

          {parsed?.ok ? (
            <p role="status" className="mt-3 text-[15px] text-slate-600">
              {parsed.range.days} {parsed.range.days === 1 ? "day" : "days"} included · {parsed.range.from} to {parsed.range.to}
            </p>
          ) : parsed ? (
            <p role="alert" className="mt-3 text-[15px] font-medium text-red-600">
              {parsed.message}
            </p>
          ) : (
            <p className="mt-3 text-[15px] text-slate-600">Pick a start and end date to enable the download.</p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-5 max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <Users className="size-5" aria-hidden="true" />
            </span>
            <CardTitle>Event attendance</CardTitle>
          </div>
          <CardDescription>
            One file per event: everyone on the roster, who checked in and out, absences and walk-ins.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormField label="Event" htmlFor="session-report-event">
            <Select
              id="session-report-event"
              name="sessionId"
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              disabled={sessionsLoading || sessions.length === 0}
            >
              {sessions.length === 0 ? (
                <option value="">{sessionsLoading ? "Loading events…" : "No events available"}</option>
              ) : (
                sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title} · {sessionDateLabel(session.startsAt)}
                  </option>
                ))
              )}
            </Select>
          </FormField>

          <div className="mt-4">
            {sessionHref ? (
              <a
                href={sessionHref}
                download
                className={buttonVariants({ variant: "default", size: "lg" }) + " h-12 w-full"}
              >
                <Download aria-hidden="true" /> Download event CSV
              </a>
            ) : (
              <span
                aria-disabled="true"
                className={`${buttonVariants({ variant: "outline", size: "lg" })} pointer-events-none h-12 w-full opacity-50`}
              >
                <Download aria-hidden="true" /> Download event CSV
              </span>
            )}
          </div>

          {sessionsLoading ? (
            <p role="status" className="mt-3 text-[15px] text-slate-600">
              Loading events…
            </p>
          ) : sessionsError ? (
            <p role="alert" className="mt-3 text-[15px] font-medium text-red-600">
              {sessionsError}
            </p>
          ) : sessions.length === 0 ? (
            <p className="mt-3 text-[15px] text-slate-600">No events yet. Create one on the Attendance page.</p>
          ) : (
            <p className="mt-3 text-[15px] text-slate-600">
              {sessions.length} {sessions.length === 1 ? "event" : "events"} · newest first
            </p>
          )}
        </CardContent>
      </Card>

      <section className="mt-5 max-w-2xl">
        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" />
            <p className="text-[15px] leading-relaxed text-slate-600">
              Viewer roles get initials and a scrambled ID instead of full names. Every download is recorded in the audit log.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="mt-5 max-w-2xl" aria-label="Other views">
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100">
              <li>
                <Link href={`/org/${orgId}/attendance`} className="flex min-h-[64px] items-center justify-between gap-3 px-5 py-3">
                  <span>
                    <span className="block text-[16.5px] font-semibold text-slate-900">Attendance by session</span>
                    <span className="mt-0.5 block text-[14px] text-slate-500">Who came, status, approvals</span>
                  </span>
                  <CalendarCheck className="size-5 shrink-0 text-slate-400" aria-hidden="true" />
                </Link>
              </li>
              <li>
                <Link href={`/org/${orgId}/settings`} className="flex min-h-[64px] items-center justify-between gap-3 px-5 py-3">
                  <span>
                    <span className="block text-[16.5px] font-semibold text-slate-900">Audit log</span>
                    <span className="mt-0.5 block text-[14px] text-slate-500">Every recorded action, newest first</span>
                  </span>
                  <ArrowUpRight className="size-5 shrink-0 text-slate-400" aria-hidden="true" />
                </Link>
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
