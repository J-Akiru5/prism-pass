import { AlertTriangle, CheckCircle2, CloudOff, Copy, Info, XCircle } from "lucide-react";
import { clsx } from "clsx";
import type { ScanTone } from "@/modules/scanner/presentation";

export type { ScanTone } from "@/modules/scanner/presentation";

// Outcome banner modeled on the reference scanner: left accent border,
// glyph + bold label + message, arm's-length readable. The attendee name is the
// largest line on every accepted scan (M1); refusal tones never receive one.
const TONES: Record<ScanTone, { box: string; Icon: typeof CheckCircle2; label: string }> = {
  success: { box: "border-success bg-success/10 text-success", Icon: CheckCircle2, label: "Accepted" },
  warning: { box: "border-accent bg-accent/10 text-primary", Icon: Copy, label: "Duplicate" },
  info: { box: "border-info bg-info/10 text-info", Icon: Info, label: "Notice" },
  danger: { box: "border-destructive bg-destructive/10 text-destructive", Icon: XCircle, label: "Rejected" },
  muted: { box: "border-muted-foreground bg-muted text-muted-foreground", Icon: AlertTriangle, label: "Status" },
  // Offline capture is explicitly provisional (ADR-09): the label says so and
  // the icon is not a success tick.
  queued: { box: "border-info bg-info/10 text-info", Icon: CloudOff, label: "Queued offline" },
};

export function ScanResult({
  tone,
  title,
  message,
  personName,
  assertive,
}: {
  tone: ScanTone;
  title?: string;
  message: string;
  personName?: string;
  assertive?: boolean;
}) {
  const { box, Icon, label } = TONES[tone];
  return (
    <div role={assertive ? "alert" : "status"} aria-live={assertive ? "assertive" : "polite"} aria-atomic="true"
      className={clsx("rounded-xl border-l-4 px-4 py-4 text-base font-semibold shadow-sm", box)}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          {personName && (
            <p className="break-words text-[22px] font-extrabold leading-tight tracking-tight">{personName}</p>
          )}
          <p className={clsx("font-bold leading-tight", personName ? "mt-0.5 text-base" : "text-lg")}>
            {title ?? label}
          </p>
          <p className="mt-1 break-words text-base font-medium leading-snug">{message}</p>
        </div>
      </div>
    </div>
  );
}
