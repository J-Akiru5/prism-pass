"use client";

import { useEffect } from "react";
import { Button } from "./ui/button";

// Modal language from the reference: navy-deep/40 scrim + blur, rounded-2xl card.
export function ConfirmationDialog({ title, body, confirmLabel = "Confirm", tone = "default", busy, onConfirm, onClose }: {
  title: string;
  body: string;
  confirmLabel?: string;
  tone?: "default" | "destructive";
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border bg-card shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="border-b p-5">
          <h3 id="confirm-title" className="font-display text-lg font-bold">{title}</h3>
        </div>
        <p className="p-5 text-sm text-muted-foreground">{body}</p>
        <div className="flex justify-end gap-2 border-t bg-muted/40 p-4">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={tone === "destructive" ? "destructive" : "default"} size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
