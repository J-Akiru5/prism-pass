import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { HTMLAttributes } from "react";

// Tone map mirrors the inspected scanner outcome banner:
// success / warning(gold) / info(navy) / danger.
const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", {
  variants: {
    variant: {
      default: "bg-primary/10 text-primary dark:bg-primary/20",
      success: "bg-success/10 text-success",
      warning: "bg-accent/20 text-gold-dark",
      danger: "bg-destructive/10 text-destructive",
      info: "bg-info/10 text-info",
      muted: "bg-muted text-muted-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={twMerge(clsx(badgeVariants({ variant }), className))} {...props} />;
}

export { badgeVariants };
