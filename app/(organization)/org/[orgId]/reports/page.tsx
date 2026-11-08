"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarCheck, Download, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MAX_DTR_RANGE_DAYS, parseDtrRange } from "@/modules/reports/range";

function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Reports hub: one clear job — export the daily time record for a date range.
export default function ReportsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  // Defaults are resolved after mount so server and client markup never disagree
  // about "today" across timezones (a hydration mismatch).
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    const now = new Date();
    setFrom(toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
    setTo(toDateInput(now));
  }, []);

  const parsed = useMemo(() => (from && to ? parseDtrRange(from, to) : null), [from, to]);
  const href = parsed?.ok
    ? `/api/v1/orgs/${orgId}/reports/dtr?from=${encodeURIComponent(parsed.range.from)}&to=${encodeURIComponent(parsed.range.to)}&format=csv`
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
