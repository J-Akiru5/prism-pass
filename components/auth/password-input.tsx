"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface PasswordInputProps extends InputHTMLAttributes<HTMLInputElement> {}

/** Pure helpers keep the visibility rules testable without a DOM. */
export function getPasswordInputType(revealed: boolean): "text" | "password" {
  return revealed ? "text" : "password";
}

export function getPasswordToggleLabel(revealed: boolean): string {
  return revealed ? "Hide password" : "Show password";
}

/**
 * Password field with a show/hide toggle. The button is absolutely positioned
 * inside a fixed-width wrapper and the input reserves matching right padding,
 * so revealing the value never shifts the layout.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { id, className, disabled, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [revealed, setRevealed] = useState(false);
  const toggleLabel = getPasswordToggleLabel(revealed);

  return (
    <div className="relative">
      <Input
        {...props}
        ref={ref}
        id={inputId}
        type={getPasswordInputType(revealed)}
        disabled={disabled}
        className={className ? `pr-11 ${className}` : "pr-11"}
      />
      <button
        type="button"
        onClick={() => setRevealed((current) => !current)}
        aria-label={toggleLabel}
        aria-pressed={revealed}
        aria-controls={inputId}
        disabled={disabled}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[10px] text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:text-slate-500"
      >
        {revealed ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
});
