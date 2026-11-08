import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { HTMLAttributes } from "react";

// Status tags: 6px radius, tinted fill, hairline ring. Reads as data, not candy.
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-semibold leading-5 ring-1 ring-inset",
  {
    variants: {
      variant: {
        default: "bg-slate-50 text-slate-700 ring-slate-200",
        success: "bg-emerald-50 text-emerald-700 ring-emerald-200/80",
        warning: "bg-amber-50 text-amber-800 ring-amber-200/80",
        danger: "bg-red-50 text-red-700 ring-red-200/80",
        info: "bg-blue-50 text-blue-700 ring-blue-200/80",
        muted: "bg-white text-slate-500 ring-slate-200",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={twMerge(clsx(badgeVariants({ variant }), className))} {...props} />;
}

export { badgeVariants };
