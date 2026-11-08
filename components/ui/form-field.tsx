"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

type ControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
};

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
      <label htmlFor={controlId} className="block text-[13px] font-semibold text-slate-900 dark:text-white">
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="text-blue-600"> *</span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>
      {control}
      {showHint && <p id={hintId} className="text-[13px] text-slate-500">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-[13px] font-medium text-red-600">{error}</p>}
    </div>
  );
}
