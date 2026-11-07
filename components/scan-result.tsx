import { AlertTriangle, CheckCircle2, Copy, Info, XCircle } from "lucide-react";
import { clsx } from "clsx";

export type ScanTone = "success" | "warning" | "info" | "danger" | "muted";

// Outcome banner modeled on the reference scanner: left accent border,
// glyph + bold label + message, arm's-length readable.
const TONES: Record<ScanTone, { box: string; Icon: typeof CheckCircle2; label: string }> = {
  success: { box: "border-success bg-success/10 text-success", Icon: CheckCircle2, label: "Accepted" },
  warning: { box: "border-accent bg-accent/10 text-primary", Icon: Copy, label: "Duplicate" },
  info: { box: "border-info bg-info/10 text-info", Icon: Info, label: "Notice" },
  danger: { box: "border-destructive bg-destructive/10 text-destructive", Icon: XCircle, label: "Rejected" },
  muted: { box: "border-muted-foreground bg-muted text-muted-foreground", Icon: AlertTriangle, label: "Status" },
};

export function ScanResult({ tone, title, message, assertive }: { tone: ScanTone; title?: string; message: string; assertive?: boolean }) {
  const { box, Icon, label } = TONES[tone];
  return (
    <div role={assertive ? "alert" : "status"} aria-live={assertive ? "assertive" : "polite"} aria-atomic="true"
      className={clsx("rounded-xl border-l-4 px-4 py-4 text-base font-semibold shadow-sm", box)}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight">{title ?? label}</p>
          <p className="mt-1 break-words text-base font-medium leading-snug">{message}</p>
        </div>
      </div>
    </div>
  );
}
