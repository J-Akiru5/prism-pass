"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal shell for the platform console.
 *
 * - `role="dialog"` + `aria-modal` + generated `aria-labelledby`/`describedby`
 * - initial focus lands on the first field (or first control)
 * - Tab/Shift+Tab are trapped inside the card
 * - Escape closes (unless the caller's `onClose` refuses while busy)
 * - focus returns to the trigger and body scroll is restored on unmount
 *
 * The visual language stays editorial: navy scrim, hairline card, no gradient.
 */
export function Modal({
  title,
  description,
  children,
  footer,
  onClose,
  width = "max-w-lg",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  width?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  // Keep the latest close handler without re-running the focus effect on every
  // parent render (an inline arrow would otherwise steal focus repeatedly).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const card = cardRef.current;
    const focusables = () =>
      Array.from(card?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
    const preferred = card?.querySelector<HTMLElement>("textarea, input, select") ?? focusables()[0];
    preferred?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) {
        event.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = bodyOverflow;
      previous?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`w-full ${width} max-h-[88dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg`}
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 id={titleId} className="text-lg font-bold leading-tight tracking-tight">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-1 text-sm text-slate-500">
              {description}
            </p>
          )}
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Reason-required mutation dialog (admin revoke, suspend, …).
 *
 * The reason is validated locally for latency, then validated again by zod on
 * the server — hiding the button is never the control. Success/error messages
 * live in an `aria-live` region so a screen reader hears the async result.
 */
export function ReasonDialog({
  title,
  description,
  confirmLabel,
  tone = "default",
  busy,
  minLength = 3,
  placeholder,
  error,
  notice,
  requireReason = true,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "default" | "destructive";
  busy?: boolean;
  minLength?: number;
  placeholder?: string;
  error?: string | null;
  notice?: string | null;
  requireReason?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const formId = useId();
  const reasonId = useId();
  const hintId = useId();
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (requireReason && trimmed.length < minLength) {
      setLocalError(`A reason of at least ${minLength} characters is required.`);
      return;
    }
    if (!requireReason && trimmed.length > 0 && trimmed.length < minLength) {
      setLocalError(`Leave the reason empty, or use at least ${minLength} characters.`);
      return;
    }
    setLocalError(null);
    onConfirm(trimmed);
  }

  return (
    <Modal
      title={title}
      description={description}
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <Button variant="ghost" className="h-11" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant={tone === "destructive" ? "destructive" : "default"}
            className="h-11"
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-2">
        <label
          htmlFor={reasonId}
          className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
        >
          {requireReason ? "Reason (required)" : "Reason (optional)"}
        </label>
        <textarea
          id={reasonId}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={280}
          placeholder={placeholder}
          aria-describedby={hintId}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <p id={hintId} className="text-xs text-muted-foreground">
          Recorded in the platform audit log. {requireReason ? `At least ${minLength} characters.` : "Optional."}
        </p>
        <div aria-live="polite" className="min-h-5">
          {(localError || error) && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {localError ?? error}
            </p>
          )}
          {!localError && !error && notice && <p className="text-xs font-medium text-success">{notice}</p>}
        </div>
      </form>
    </Modal>
  );
}
