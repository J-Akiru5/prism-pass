"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * Ending a session has to be reachable from every console — a shared device at
 * a gate is the normal case, not the exception. Both variants are 44px tall.
 */
export function SignOutButton({ variant = "full" }: { variant?: "full" | "icon" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await createClient().auth.signOut();
    } catch {
      // Session may already be gone; the login route re-checks anyway.
    }
    router.replace("/login");
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        aria-label={busy ? "Signing out" : "Sign out"}
        title="Sign out"
        className="inline-flex size-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
      >
        <LogOut className="size-4" aria-hidden="true" />
      </button>
    );
  }

  return (
    <Button variant="outline" onClick={signOut} disabled={busy} className="shrink-0">
      <LogOut aria-hidden="true" />
      {busy ? "Signing out…" : "Sign out"}
    </Button>
  );
}
