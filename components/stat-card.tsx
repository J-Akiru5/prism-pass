import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "./ui/card";

export function StatCard({ label, value, sub, icon: Icon, tone = "default" }: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const bar: Record<string, string> = {
    default: "bg-primary",
    success: "bg-success",
    warning: "bg-accent",
    danger: "bg-destructive",
    info: "bg-info",
  };
  return (
    <Card className="relative overflow-hidden">
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${bar[tone]}`} />
      <CardContent className="p-4 pl-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden="true" />}
        </div>
        <p className="mt-1 font-display text-3xl font-bold leading-none">{value}</p>
        {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
