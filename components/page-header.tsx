import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({ title, description, eyebrow, actions, crumbs, as: Heading = "h1" }: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  crumbs?: { label: string; href?: string }[];
  /** Default is the page title; use h2 for a second section on the same page. */
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3" aria-hidden="true" />}
                {c.href ? <Link href={c.href} className="hover:text-foreground hover:underline">{c.label}</Link> : <span aria-current="page">{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        {eyebrow && <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-gold-dark">{eyebrow}</p>}
        <Heading className="font-display text-2xl font-bold leading-tight md:text-3xl">{title}</Heading>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
