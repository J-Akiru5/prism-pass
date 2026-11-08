"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "./ui/button";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Modal language from the reference: navy-deep/40 scrim + blur, rounded-2xl card.
// Keyboard behaviour: focus moves into the dialog (Cancel first), Tab/Shift+Tab
// stay inside it, Escape and the scrim close it, and focus returns to the
// trigger on unmount. While a request is busy the dialog refuses to close.
export function ConfirmationDialog({ title, body, confirmLabel = "Confirm", tone = "default", busy, onConfirm, onClose }: {
  title: string;
  body: string;
  confirmLabel?: string;
  tone?: "default" | "destructive";
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);
  const closeRef = useRef(onClose);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;

    const focusables = () =>
      panel
        ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute("disabled"))
        : [];

    // Least-destructive control first: Cancel is the safe default.
    const initial = cancelRef.current && !cancelRef.current.disabled ? cancelRef.current : focusables()[0] ?? panel;
    initial?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!busyRef.current) {
          event.preventDefault();
          closeRef.current();
        }
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/40 p-4 backdrop-blur-sm"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        aria-busy={busy || undefined}
        tabIndex={-1}
        className="w-full max-w-md overflow-hidden rounded-2xl border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b p-5">
          <h2 id={titleId} className="font-display text-lg font-bold">{title}</h2>
        </div>
        <p id={bodyId} className="p-5 text-sm text-muted-foreground">{body}</p>
        <div className="flex justify-end gap-2 border-t bg-muted/40 p-4">
          <Button ref={cancelRef} type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            type="button"
            variant={tone === "destructive" ? "destructive" : "default"}
            size="sm"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
