"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

type ControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
};

/**
 * Label + hint + error wrapper. Hints and errors are programmatically tied to
 * the single control it wraps (`aria-describedby`), and an error also marks the
 * control `aria-invalid` so assistive tech connects the message to the field
 * instead of announcing it in isolation.
 */
export function FormField({ label, htmlFor, hint, error, children, required }: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
}) {
  const autoId = useId();
  const child = isValidElement(children) ? (children as ReactElement<ControlProps>) : null;
  const controlId = htmlFor ?? child?.props.id ?? autoId;
  const showHint = Boolean(hint) && !error;
  const hintId = showHint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy =
    [child?.props["aria-describedby"], hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = child
    ? cloneElement(child, {
        id: child.props.id ?? controlId,
        "aria-describedby": describedBy,
        ...(error ? { "aria-invalid": true } : {}),
      })
    : children;

  return (
    <div className="space-y-1.5">
      <label htmlFor={controlId} className="block text-[11px] font-bold uppercase tracking-wider text-primary">
        {label}
        {required && (
          <>
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>
      {control}
      {showHint && <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
