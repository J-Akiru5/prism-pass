"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { CalendarClock, Eye, EyeOff, Printer, ShieldCheck, ShieldOff } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { PersonAvatar } from "./ui/avatar";

export type PassInfo = {
  id: string;
  passPublicId: string;
  version: number;
  status: string;
  expiresAt: string | null;
};

// Digital pass card: navy identity header, QR panel (when a one-time payload is
// supplied), validity row. The credential secret is stored hashed, so this card
// cannot synthesise a scannable code — when `qrValue` is absent it says so
// instead of rendering a QR that would fail at a checkpoint.
export function DigitalPassCard({ personName, externalId, orgName, pass, qrValue, showPrint }: {
  personName: string;
  externalId?: string | null;
  orgName?: string;
  pass: PassInfo;
  qrValue?: string | null;
  showPrint?: boolean;
}) {
  const [show, setShow] = useState(true);
  const active = pass.status === "ACTIVE";
  return (
    <Card className="overflow-hidden">
      <div className="relative bg-gradient-to-br from-navy-deep via-navy to-navy-light p-5 text-white">
        <div aria-hidden="true" className="absolute -right-8 -top-8 h-32 w-32 rounded-full border border-white/10" />
        <div className="relative flex items-center gap-3">
          <PersonAvatar name={personName} size="lg" />
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-widest text-gold-soft">{orgName ?? "Prism Pass"}</p>
            <p className="truncate font-display text-xl font-bold leading-tight">{personName}</p>
            {externalId && <p className="font-mono text-xs text-white/70">{externalId}</p>}
          </div>
          <span className="ml-auto shrink-0">
            <Badge variant={active ? "success" : "danger"} className="border border-white/20 bg-white/10 !text-white">
              {pass.status}
            </Badge>
          </span>
        </div>
      </div>
      <CardContent className="flex flex-col items-center p-5">
        {qrValue ? (
          <>
            <div className="rounded-xl border bg-white p-4">
              {show ? <QRCodeSVG value={qrValue} size={180} /> : (
                <div className="flex h-[180px] w-[180px] items-center justify-center text-sm text-muted-foreground">Hidden</div>
              )}
            </div>
            <p className="mt-2 font-mono text-xs text-muted-foreground">{pass.passPublicId} · v{pass.version}</p>
          </>
        ) : (
          <div className="w-full rounded-xl border border-dashed p-5 text-center">
            <ShieldOff className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium">No scannable code on this device</p>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
              The QR secret is shown once, when the pass is issued, and stored only as a hash. Ask an
              administrator to re-issue this pass to get a new scannable code.
            </p>
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">{pass.passPublicId} · v{pass.version}</p>
          </div>
        )}
        <div className="mt-3 flex w-full flex-col gap-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5" aria-hidden="true" /> Opaque credential — no personal data in QR</span>
          {pass.expiresAt && <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-3.5" aria-hidden="true" /> Expires {new Date(pass.expiresAt).toLocaleString()}</span>}
        </div>
        {(qrValue || showPrint) && (
          <div className="mt-4 flex gap-2">
            {qrValue && (
              <Button variant="outline" size="sm" onClick={() => setShow((s) => !s)}>
                {show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />} {show ? "Hide" : "Show"}
              </Button>
            )}
            {showPrint && <Button variant="outline" size="sm" onClick={() => window.print()}><Printer aria-hidden="true" /> Print</Button>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
