import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "./ui/card";

export function StatCard({ label, value, sub, icon: Icon, tone = "default" }: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const dot: Record<string, string> = {
    default: "bg-slate-900 dark:bg-white",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-red-500",
    info: "bg-blue-500",
  };
  return (
    <Card>
      <CardContent className="p-4 md:p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dot[tone]}`} />
            {label}
          </p>
          {Icon && <Icon className="size-4 text-slate-400" aria-hidden="true" />}
        </div>
        <p className="tnum mt-2 text-[28px] font-bold leading-none tracking-tight">{value}</p>
        {sub && <p className="mt-1.5 text-[13px] text-slate-500">{sub}</p>}
      </CardContent>
    </Card>
  );
}
