"use client";

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const fieldBase =
  "w-full rounded-[10px] border border-slate-200 bg-white px-3.5 text-[16px] text-slate-900 " +
  "shadow-[0_1px_2px_rgba(15,23,42,0.04)_inset] " +
  "transition-[border-color,box-shadow] duration-150 placeholder:text-slate-400 " +
  "hover:border-slate-300 " +
  "focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/12 " +
  "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 disabled:shadow-none";

/** Text field — 16px on phones so iOS never zooms, 15px on desktop. */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, type, ...props }, ref) {
  return <input ref={ref} type={type} className={twMerge(clsx(fieldBase, "h-12 py-2 md:h-11 md:text-[15px]", className))} {...props} />;
});

/** Native select with our own chevron — never the OS-grey control. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={twMerge(clsx(fieldBase, "pp-select h-12 cursor-pointer py-2 pr-9 font-medium md:h-11 md:text-[15px]", className))} {...props}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={twMerge(clsx(fieldBase, "min-h-24 py-3 leading-relaxed md:text-[15px]", className))} {...props} />;
});
