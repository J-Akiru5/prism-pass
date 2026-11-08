"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { forwardRef, type ButtonHTMLAttributes } from "react";

// One control surface for the whole product: 10px radius, 14.5px semibold,
// a hairline inner highlight on solid fills, 44px touch height on phones.
const buttonVariants = cva(
  [
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px]",
    "text-[14.5px] font-semibold tracking-[-0.01em]",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150",
    "active:translate-y-px",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
    "disabled:pointer-events-none disabled:opacity-45",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-blue-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(2,6,23,0.28)] hover:bg-blue-700 active:bg-blue-800",
        ink:
          "bg-slate-900 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(2,6,23,0.3)] hover:bg-slate-800",
        action:
          "bg-blue-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(2,6,23,0.28)] hover:bg-blue-700",
        gold:
          "bg-blue-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(2,6,23,0.28)] hover:bg-blue-700",
        outline:
          "border border-slate-200 bg-white text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
        secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200/80",
        ghost: "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900",
        destructive:
          "bg-red-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_1px_2px_rgba(2,6,23,0.24)] hover:bg-red-700",
        link: "h-auto px-0 text-blue-700 underline decoration-blue-300 underline-offset-4 hover:decoration-blue-600",
      },
      size: {
        default: "h-11 min-h-[44px] px-4 md:min-h-0",
        sm: "h-9 min-h-[36px] rounded-lg px-3 text-[13.5px]",
        lg: "h-12 rounded-xl px-6 text-[15.5px]",
        icon: "size-11 min-h-[44px] min-w-[44px] p-0 md:min-h-0 md:min-w-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size, ...props }, ref) {
  return <button ref={ref} className={twMerge(clsx(buttonVariants({ variant, size }), className))} {...props} />;
});

export { buttonVariants };
