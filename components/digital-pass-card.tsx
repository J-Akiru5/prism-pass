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
  /** Derived QR payload for on-screen display; null for legacy random-secret passes. */
  qrPayload?: string | null;
};

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
    <Card className="print-card overflow-hidden">
      <div className="bg-slate-900 p-5 text-white dark:bg-white dark:text-slate-900">
        <div className="flex items-center gap-3">
          <PersonAvatar name={personName} size="lg" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-300 dark:text-slate-500">
              {orgName ?? "Prism Pass"}
            </p>
            <p className="mt-0.5 truncate text-[20px] font-bold leading-none tracking-tight">{personName}</p>
            <p className="tnum mt-1.5 font-mono text-[11px] tracking-wide text-slate-400 dark:text-slate-500">
              {externalId ?? "NO EXTERNAL ID"} · {pass.passPublicId} · v{pass.version}
            </p>
          </div>
          <Badge variant={active ? "success" : "danger"} className="shrink-0">
            {pass.status}
          </Badge>
        </div>
      </div>
      <div className="registry-rule" aria-hidden="true" />
      <CardContent className="flex flex-col items-center p-5">
        {qrValue ? (
          <>
            <div className="qr-crisp rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {show ? <QRCodeSVG value={qrValue} size={184} level="M" /> : (
                <div className="flex h-[184px] w-[184px] items-center justify-center text-sm text-slate-400">Hidden</div>
              )}
            </div>
            <p className="tnum mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Scan at any checkpoint
            </p>
            <p className="tnum mt-1 text-center font-mono text-[11px] leading-relaxed text-slate-400">
              {pass.passPublicId} · v{pass.version}
            </p>
          </>
        ) : (
          <div className="w-full rounded-2xl border border-dashed border-slate-300 p-6 text-center">
            <ShieldOff className="mx-auto size-5 text-slate-400" aria-hidden="true" />
            <p className="mt-2 text-[16px] font-bold tracking-tight">No scannable code on this device</p>
            <p className="fineprint mx-auto mt-1 max-w-xs">
              The QR secret is shown once at issuance and stored only as a hash. Ask an
              administrator to re-issue this pass.
            </p>
            <p className="tnum mt-2 font-mono text-[11px] text-slate-400">{pass.passPublicId} · v{pass.version}</p>
          </div>
        )}
        <div className="mt-4 grid w-full gap-1.5 border-t border-slate-100 pt-3 text-[13px] text-slate-500">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4 text-emerald-600" aria-hidden="true" /> Opaque credential — no personal data in QR</span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="size-4" aria-hidden="true" />
            {pass.expiresAt ? `Expires ${new Date(pass.expiresAt).toLocaleString()}` : "No expiry — revocation enforced live"}
          </span>
        </div>
        {(qrValue || showPrint) && (
          <div className="no-print mt-4 flex flex-wrap justify-center gap-2">
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
