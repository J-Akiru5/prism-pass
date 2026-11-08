"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/logo";

export function PageHeader({ title, description, actions, crumbs, as: Heading = "h1" }: {
  title: string;
  description?: string;
  actions?: ReactNode;
  crumbs?: { label: string; href?: string }[];
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <section className="pp-hero relative isolate overflow-hidden rounded-2xl text-white">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-blue-400 via-violet-400 to-teal-300" />
      <BrandLogo
        variant="mark"
        size={210}
        decorative
        className="pointer-events-none absolute -right-6 -top-9 hidden opacity-[0.12] sm:block"
      />
      <div className="relative z-10 flex flex-col gap-5 px-5 pb-6 pt-6 md:flex-row md:items-end md:justify-between md:gap-10 md:px-8 md:pb-8 md:pt-8">
        <div className="min-w-0">
          {crumbs && crumbs.length > 0 && (
            <nav aria-label="Breadcrumb" className="mb-3 flex min-h-[24px] flex-wrap items-center gap-1 text-[14px] text-white/55">
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="size-4 text-white/30" aria-hidden="true" />}
                  {c.href ? (
                    <Link href={c.href} className="rounded px-1 py-1 font-medium hover:text-white hover:underline">{c.label}</Link>
                  ) : (
                    <span aria-current="page" className="px-1 py-1 text-white/85">{c.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          <Heading className="text-balance text-[26px] font-semibold leading-[1.08] tracking-[-0.025em] text-white md:text-[34px]">{title}</Heading>
          {description && (
            <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed text-white/60 md:text-[15.5px]">{description}</p>
          )}
        </div>
        {actions && (
          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">{actions}</div>
        )}
      </div>
    </section>
  );
}
