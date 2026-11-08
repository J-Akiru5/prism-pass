import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function PersonAvatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const initial = (name.trim().charAt(0) || "U").toUpperCase();
  const dims = size === "sm" ? "h-8 w-8 text-xs" : size === "lg" ? "h-14 w-14 text-xl" : "h-10 w-10 text-sm";
  return (
    <div
      aria-hidden="true"
      className={twMerge(clsx("flex shrink-0 items-center justify-center rounded-full bg-slate-900 font-bold text-white dark:bg-white dark:text-slate-900", dims, className))}
    >
      {initial}
    </div>
  );
}
