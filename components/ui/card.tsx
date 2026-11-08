import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { HTMLAttributes } from "react";

function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={twMerge(clsx("relative rounded-xl border border-slate-200 bg-white text-slate-900", className))}
      {...props}
    >
      {children}
    </div>
  );
}

function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={twMerge(clsx("flex flex-col gap-1 p-5 pb-3 md:p-6 md:pb-3", className))} {...props} />;
}

function CardEyebrow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={twMerge(clsx("text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400", className))} {...props} />;
}

function CardTitle({ className, as: Heading = "h2", ...props }: HTMLAttributes<HTMLHeadingElement> & {
  as?: "h1" | "h2" | "h3" | "h4";
}) {
  return <Heading className={twMerge(clsx("text-[17px] font-bold leading-tight tracking-tight", className))} {...props} />;
}

function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={twMerge(clsx("text-sm leading-relaxed text-slate-500 dark:text-slate-400", className))} {...props} />;
}

function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={twMerge(clsx("p-5 pt-0 md:p-6 md:pt-0", className))} {...props} />;
}

function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={twMerge(clsx("flex flex-wrap items-center gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5", className))} {...props} />;
}

export { Card, CardHeader, CardEyebrow, CardTitle, CardDescription, CardContent, CardFooter };
