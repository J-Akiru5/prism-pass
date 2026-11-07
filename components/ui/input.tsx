"use client";

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { forwardRef, type InputHTMLAttributes } from "react";

// Form language from the reference: bordered, rounded-lg, gold focus ring.
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, type, ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      className={twMerge(
        clsx(
          "flex h-10 w-full rounded-lg border border-input bg-card px-3.5 py-2 text-sm text-foreground",
          "placeholder:text-muted-foreground",
          "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        ),
      )}
      {...props}
    />
  );
});
