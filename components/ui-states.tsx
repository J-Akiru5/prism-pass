import { Loader2, SearchX, AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 rounded-xl border bg-card px-4 py-10 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-6 py-10 text-center">
      <SearchX className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
      <p className="mt-2 font-display text-base font-bold">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border-l-4 border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Something went wrong</p>
        <p className="mt-0.5 break-words">{message}</p>
        {retry && <button type="button" onClick={retry} className="mt-2 font-semibold underline underline-offset-2">Try again</button>}
      </div>
    </div>
  );
}
