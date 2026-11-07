"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowRight, CalendarCheck, FileText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Reports hub (P7 full exports pending): honest links into live data only.
export default function ReportsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const base = `/org/${orgId}`;
  return (
    <>
      <PageHeader
        title="Reports"
        description="Snapshots and exports. Full DTR CSV/PDF generation lands with the P7 workflows phase."
        eyebrow="Reporting"
      />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarCheck className="size-4" aria-hidden="true" /> Attendance by session</CardTitle>
            <CardDescription>Live records with status, approval, and duration.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`${base}/attendance`}><Button size="sm">Open attendance <ArrowRight aria-hidden="true" /></Button></Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="size-4" aria-hidden="true" /> Daily time record</CardTitle>
            <CardDescription>Per-person DTR export (CSV/PDF) — scheduled for P7. No placeholder data is shown here.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Exports will read the canonical attendance events with your existing report permissions.</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
