import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { HTMLAttributes } from "react";

function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={twMerge(clsx("rounded-xl border bg-card text-card-foreground shadow-sm", className))} {...props} />;
}

function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={twMerge(clsx("flex flex-col gap-1 p-5 pb-3", className))} {...props} />;
}

function CardEyebrow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={twMerge(clsx("font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground", className))} {...props} />;
}

// Cards sit directly under the page <h1>, so their title is an <h2> by default;
// a caller whose card is the page title itself can opt into another level.
function CardTitle({ className, as: Heading = "h2", ...props }: HTMLAttributes<HTMLHeadingElement> & {
  as?: "h1" | "h2" | "h3" | "h4";
}) {
  return <Heading className={twMerge(clsx("font-display text-lg font-bold leading-tight", className))} {...props} />;
}

function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={twMerge(clsx("text-sm text-muted-foreground", className))} {...props} />;
}

function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={twMerge(clsx("p-5 pt-0", className))} {...props} />;
}

function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={twMerge(clsx("flex items-center gap-2 border-t bg-muted/40 p-4", className))} {...props} />;
}

export { Card, CardHeader, CardEyebrow, CardTitle, CardDescription, CardContent, CardFooter };
