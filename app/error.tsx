"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary. Shows a real, useful failure state instead of a
 * blank screen, keeps the digest for support, and never claims the action
 * succeeded.
 */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[prism-pass] route error", error.digest ?? "", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-xl flex-col justify-center px-4 py-16 md:px-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Error</p>
      <h1 className="mt-3 font-display text-3xl font-bold leading-tight">This screen could not load</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Nothing was changed by this failure. Retry the screen; if it keeps failing, send the reference
        below to support.
      </p>
      <div className="mt-6 flex items-start gap-3 border-y py-4">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0 text-sm">
          <p className="font-medium">Reference</p>
          <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">{error.digest ?? "no digest issued"}</p>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={reset}><RotateCcw aria-hidden="true" /> Try again</Button>
        <Link href="/consoles"><Button variant="outline">Back to consoles</Button></Link>
      </div>
    </main>
  );
}
