import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Navy circle with gold-soft initial (reference header pattern).
export function PersonAvatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const initial = (name.trim().charAt(0) || "U").toUpperCase();
  const dims = size === "sm" ? "h-8 w-8 text-xs" : size === "lg" ? "h-14 w-14 text-xl" : "h-10 w-10 text-sm";
  return (
    <div
      aria-hidden="true"
      className={twMerge(clsx("flex shrink-0 items-center justify-center rounded-full border border-accent bg-primary font-bold text-gold-soft shadow-sm", dims, className))}
    >
      {initial}
    </div>
  );
}
