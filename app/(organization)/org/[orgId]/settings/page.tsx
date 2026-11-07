"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui-states";

export default function SettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const [org, setOrg] = useState<{ name: string; slug: string; status: string; timezone: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/orgs/${orgId}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? `Request failed (${r.status})`);
      setOrg(j.data);
    } catch (e) { setError((e as Error).message); }
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeader title="Settings" description="Organization profile and status. Suspension is a platform-admin action." eyebrow="Configuration" />
      <div className="mt-6 max-w-2xl">
        {error && <ErrorState message={error} retry={load} />}
        {!error && !org && <LoadingState label="Loading organization…" />}
        {org && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 className="size-4" aria-hidden="true" /> {org.name}</CardTitle>
              <CardDescription>Slug <span className="font-mono">{org.slug}</span> · Timezone {org.timezone}</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant={org.status === "ACTIVE" ? "success" : "danger"}>{org.status}</Badge>
              <p className="mt-3 text-sm text-muted-foreground">
                Branding, retention, subscription, and scoped-role management arrive with the P7/P8 phases. Membership and pass controls live on their own pages.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
