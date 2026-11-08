import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type DataTableColumn = string | { label: string; srOnly?: boolean };

/**
 * Records table. Desktop shows a real table; phones get the same rows as
 * stacked cards (label + value per cell), so nothing ever scrolls sideways.
 * Cells carry their own `label` for the mobile key.
 */
export function DataTable({ columns, children, caption, empty }: {
  columns: DataTableColumn[];
  children: ReactNode;
  caption?: string;
  empty?: ReactNode;
}) {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="pp-table w-full text-[15px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-left">
            {columns.map((column, index) => {
              const col = typeof column === "string" ? { label: column } : column;
              return (
                <th
                  key={`${col.label}-${index}`}
                  scope="col"
                  className="whitespace-nowrap px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-slate-500"
                >
                  {col.srOnly ? <span className="sr-only">{col.label}</span> : col.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function TableRow({ children }: { children: ReactNode }) {
  return <tr className="transition-colors duration-100 hover:bg-blue-50/40">{children}</tr>;
}

export function TableCell({ children, mono, className, label, actions, primary }: {
  children: ReactNode;
  mono?: boolean;
  className?: string;
  /** Row-card key shown on phones. Omit to hide the key. */
  label?: string;
  /** Marks the cell as a row's action group: buttons stretch on phones. */
  actions?: boolean;
  /** Marks the cell as a row's title: bigger, first, no key. */
  primary?: boolean;
}) {
  return (
    <td
      data-label={label ?? ""}
      className={cn(
        "px-4 py-3.5 align-middle text-slate-900",
        mono && "font-mono text-[13.5px] tabular-nums text-slate-600",
        primary && "pp-cell-primary",
        actions && "pp-cell-actions",
        className,
      )}
    >
      {children}
    </td>
  );
}
