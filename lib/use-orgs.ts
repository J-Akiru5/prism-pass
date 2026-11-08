"use client";

import { useEffect, useState } from "react";

export type OrgOption = { id: string; name: string; slug: string; role: string };

/**
 * Organizations the signed-in user belongs to. Standalone consoles use this
 * instead of asking a human to paste an organization id.
 */
export function useOrgs() {
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/orgs", { credentials: "include" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message ?? `Failed to load organizations (${r.status})`);
        return (j.data ?? []) as OrgOption[];
      })
      .then((list) => {
        if (!alive) return;
        setOrgs(list);
        setError(null);
      })
      .catch((e) => {
        if (alive) setError((e as Error).message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { orgs, loading, error };
}
