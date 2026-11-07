import type { ReactNode } from "react";

export function DataTable({ columns, children, caption, empty }: {
  columns: string[];
  children: ReactNode;
  caption?: string;
  empty?: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className="w-full min-w-[560px] text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            {columns.map((c) => (
              <th key={c} scope="col" className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{c}</th>
            ))}
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
