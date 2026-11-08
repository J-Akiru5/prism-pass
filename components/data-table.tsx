import type { ReactNode } from "react";

/**
 * Column headings are usually visible. Some tables end with a control column
 * that needs a name for screen readers but no visual header — use
 * `{ label: "Actions", srOnly: true }` instead of an empty string.
 */
export type DataTableColumn = string | { label: string; srOnly?: boolean };

export function DataTable({ columns, children, caption, empty }: {
  columns: DataTableColumn[];
  children: ReactNode;
  caption?: string;
  empty?: ReactNode;
}) {
  return (
    <div
      // A horizontally scrollable table must be reachable and scrollable from
      // the keyboard (WCAG 2.1.1); naming the region also explains the extra stop.
      role="region"
      aria-label={caption ?? "Data table"}
      tabIndex={0}
      className="overflow-x-auto rounded-xl border bg-card shadow-sm"
    >
      <table className="w-full min-w-[560px] text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            {columns.map((column, index) => {
              const col = typeof column === "string" ? { label: column } : column;
              return (
                <th key={`${col.label}-${index}`} scope="col" className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {col.srOnly ? <span className="sr-only">{col.label}</span> : col.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function TableRow({ children }: { children: ReactNode }) {
  return <tr className="transition-colors hover:bg-muted/50">{children}</tr>;
}

export function TableCell({ children, mono, className }: { children: ReactNode; mono?: boolean; className?: string }) {
  return <td className={`px-4 py-2.5 align-middle ${mono ? "font-mono text-xs" : ""} ${className ?? ""}`}>{children}</td>;
}
