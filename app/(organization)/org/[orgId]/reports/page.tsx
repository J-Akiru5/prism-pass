"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarCheck, Download, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { MAX_DTR_RANGE_DAYS, parseDtrRange } from "@/modules/reports/range";

function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const CONTRACT = [
  { label: "Granularity", value: "One row per person per local day" },
  { label: "Range", value: `Inclusive, up to ${MAX_DTR_RANGE_DAYS} days` },
  { label: "Format", value: "CSV, RFC 4180 with formula guard" },
  { label: "Scope", value: "Your organization only" },
];

// Reports hub (P7): live CSV export. Editorial ledger language — hairline rules
// and mono labels, no KPI card grid, no placeholder numbers.
export default function ReportsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const [from, setFrom] = useState(() => {
    const now = new Date();
    return toDateInput(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [to, setTo] = useState(() => toDateInput(new Date()));

  const parsed = useMemo(() => parseDtrRange(from, to), [from, to]);
  const href = parsed.ok
    ? `/api/v1/orgs/${orgId}/reports/dtr?from=${encodeURIComponent(parsed.range.from)}&to=${encodeURIComponent(parsed.range.to)}&format=csv`
    : null;

  return (
    <>
      <PageHeader
        title="Reports"
        eyebrow="Reporting"
        description="Snapshots and exports from the canonical attendance engine. Every file is generated on request from tenant-scoped records."
      />

      <section className="mt-8 border-t pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b pb-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Daily time record</h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            CSV · up to {MAX_DTR_RANGE_DAYS} days
          </span>
        </div>

        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          One row per person per day: first in, last out, total minutes, status, approval state, and exception
          flags. Overnight shifts stay on their shift date instead of splitting across two rows.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-[minmax(0,12rem)_minmax(0,12rem)_auto] sm:items-end">
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
          <div>
            {href ? (
              <a href={href} download className={buttonVariants({ variant: "gold" })}>
                <Download aria-hidden="true" /> Download CSV
              </a>
            ) : (
              <span
                aria-disabled="true"
                className={`${buttonVariants({ variant: "outline" })} pointer-events-none opacity-50`}
              >
                <Download aria-hidden="true" /> Download CSV
              </span>
            )}
          </div>
        </div>

        {parsed.ok ? (
          <p role="status" className="mt-3 font-mono text-xs tabular-nums text-muted-foreground">
            {parsed.range.days} {parsed.range.days === 1 ? "day" : "days"} · inclusive · {parsed.range.from} to{" "}
            {parsed.range.to}
          </p>
        ) : (
          <p role="alert" className="mt-3 text-sm font-medium text-destructive">
            {parsed.message}
          </p>
        )}
      </section>

      <section className="mt-12">
        <div className="border-b pb-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Export contract</h2>
        </div>
        <dl className="grid border-b sm:grid-cols-2 lg:grid-cols-4">
          {CONTRACT.map((item, index) => (
            <div
              key={item.label}
              className={[
                "px-5 py-5 first:pl-0",
                index < 2 ? "border-b sm:border-b-0" : "",
                index % 2 === 1 ? "border-l" : "",
                "lg:border-l lg:first:border-l-0",
              ].join(" ")}
            >
              <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{item.label}</dt>
              <dd className="mt-2 text-sm leading-snug">{item.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 flex items-start gap-2.5 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          <p className="max-w-2xl leading-relaxed">
            Viewer exports are masked to initials and a salted external-id hash — no name string or email is
            included. Export runs are written to the audit ledger.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b pb-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Other views</h2>
          <Link
            href={`/org/${orgId}/attendance`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Attendance log <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        </div>
        <ul className="mt-2">
          <li className="border-b py-3 last:border-b-0">
            <Link href={`/org/${orgId}/attendance`} className="group flex items-center justify-between gap-4">
              <span>
                <span className="block text-sm font-medium group-hover:underline">Attendance by session</span>
                <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Live records · status · approval · duration
                </span>
              </span>
              <CalendarCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
          <li className="py-3">
            <Link href={`/org/${orgId}/settings`} className="group flex items-center justify-between gap-4">
              <span>
                <span className="block text-sm font-medium group-hover:underline">Audit ledger</span>
                <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Recent organization events · requires organization.manage
                </span>
              </span>
              <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        </ul>
      </section>
    </>
  );
}
