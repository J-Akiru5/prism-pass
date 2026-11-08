import type { ReactNode } from "react";

export type StatItem = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
};

const TONE: Record<NonNullable<StatItem["tone"]>, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-gold-dark",
  danger: "text-destructive",
};

/**
 * One editorial stat rail — deliberately NOT a KPI card grid.
 *
 * A single hairline-ruled `<dl>` with tabular figures, mono labels and no
 * rounding, shadows or per-metric chrome. Screen readers get a description
 * list; the grid is purely visual.
 */
export function StatRail({ items, label, columns = 8 }: { items: StatItem[]; label: string; columns?: 4 | 6 | 8 }) {
  const grid =
    columns === 4
      ? "grid-cols-2 sm:grid-cols-4"
      : columns === 6
        ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
        : "grid-cols-2 sm:grid-cols-4 xl:grid-cols-8";
  return (
    <dl
      aria-label={label}
      className={`grid ${grid} gap-px border-y border-border bg-border`}
    >
      {items.map((item) => (
        <div key={item.label} className="bg-background px-4 py-4 sm:px-5">
          <dt className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {item.label}
          </dt>
          <dd
            className={`mt-1.5 font-display text-2xl font-bold leading-none tabular-nums sm:text-3xl ${TONE[item.tone ?? "default"]}`}
          >
            {item.value}
          </dd>
          {item.hint && <dd className="mt-1.5 text-xs text-muted-foreground">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
