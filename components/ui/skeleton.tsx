"use client";

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { HTMLAttributes } from "react";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={twMerge(clsx("pp-skeleton rounded-lg", className ?? "h-4 w-full"))} />;
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-hidden="true">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="mt-2 h-4 w-2/3" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full !rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-hidden="true">
      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-9 w-9 !rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-7 w-20 !rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-hidden="true">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-2 h-8 w-16 !rounded-lg" />
      <Skeleton className="mt-2 h-3 w-28" />
    </div>
  );
}

export function StatStripSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-hidden="true">
      <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="px-5 py-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-8 w-14" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-hidden="true">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-11 w-full !rounded-[10px]" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-11 w-full !rounded-[10px]" />
      <Skeleton className="h-10 w-32 !rounded-[10px]" />
    </div>
  );
}
