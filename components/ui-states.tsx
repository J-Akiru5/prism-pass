import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";
import { Skeleton, CardSkeleton, TableSkeleton } from "./ui/skeleton";
import type { ReactNode } from "react";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
      <Loader2 className="size-4 animate-spin text-blue-600" aria-hidden="true" />
      {label}
      <span className="sr-only">Please wait while content loads.</span>
    </div>
  );
}

export function PageSkeleton({ kind = "table" }: { kind?: "table" | "cards" | "form" }) {
  return (
    <div className="space-y-3" aria-hidden="true" role="status" aria-label="Loading content">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48 !rounded-lg" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-28 !rounded-[10px]" />
      </div>
      {kind === "table" && <TableSkeleton />}
      {kind === "cards" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <CardSkeleton key={i} rows={1} />
          ))}
        </div>
      )}
      {kind === "form" && <CardSkeleton rows={4} />}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-6">
      <p className="text-[16px] font-semibold text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-prose text-[15px] leading-relaxed text-slate-600">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-800">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-bold">Something went wrong</p>
        <p className="mt-0.5 break-words text-red-700">{message}</p>
        {retry && <Button variant="outline" size="sm" onClick={retry} className="mt-2 border-red-200 bg-white">Try again</Button>}
      </div>
    </div>
  );
}
