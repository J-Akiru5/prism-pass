import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface RevealProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wrapper for a marketing section.
 *
 * It used to fade the block in on scroll. That made every section depend on an
 * animation running: with the effect stalled — a background tab, a throttled
 * compositor, a missed observer callback — the copy stayed at opacity 0 and the
 * page showed empty bands. The block is now plain markup, so the page always
 * reads in full; the section wrappers keep their layout classes.
 */
export function Reveal({ children, className }: RevealProps) {
  return <div className={cn(className)}>{children}</div>;
}
