import { ArrowRight, CheckCircle2, MinusCircle } from "lucide-react";
import { Badge } from "./ui/badge";
import { TableCell, TableRow } from "./data-table";

export type RecordRow = {
  id: string;
  personId: string;
  personName?: string;
  durationMin: number | null;
  status: string;
  approvalStatus: string;
};

const statusVariant: Record<string, "success" | "warning" | "danger" | "muted" | "info"> = {
  PRESENT: "success",
  LATE: "warning",
  ABSENT: "danger",
  EXCUSED: "info",
  PARTIAL: "warning",
};

export function AttendanceTimelineRows({ records }: { records: RecordRow[] }) {
  return (
    <>
      {records.map((r) => (
        <TableRow key={r.id}>
          <TableCell primary>
            <span className="font-semibold">{r.personName ?? `Member ${r.personId.slice(0, 8)}`}</span>
          </TableCell>
          <TableCell label="Status">
            <span className="inline-flex items-center gap-1.5">
              {r.status === "PRESENT" ? <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" /> : r.status === "LATE" ? <ArrowRight className="size-4 text-amber-600" aria-hidden="true" /> : <MinusCircle className="size-4 text-red-500" aria-hidden="true" />}
              <Badge variant={statusVariant[r.status] ?? "muted"}>{r.status}</Badge>
            </span>
          </TableCell>
          <TableCell label="Approval"><Badge variant="muted">{r.approvalStatus}</Badge></TableCell>
          <TableCell label="Duration" mono>{r.durationMin != null ? `${r.durationMin}m` : "—"}</TableCell>
        </TableRow>
      ))}
    </>
  );
}
