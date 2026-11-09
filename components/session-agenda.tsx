"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

export type AgendaSession = {
  id: string;
  title: string;
  type: string;
  startsAt: string;
  endsAt: string;
  /** M1 lifecycle; undefined behaves as OPEN for pre-M1 payloads. */
  status?: "OPEN" | "CLOSED";
};

type State = "closed" | "live" | "upcoming" | "past";

const TONE: Record<State, { dot: string; label: string; text: string }> = {
  closed: { dot: "bg-red-500", label: "Closed", text: "text-red-700" },
  live: { dot: "bg-emerald-500", label: "Live now", text: "text-emerald-700" },
  upcoming: { dot: "bg-blue-500", label: "Upcoming", text: "text-blue-700" },
  // An event nobody closed keeps accepting until it is closed; past its end it
  // is late, not finished.
  past: { dot: "bg-amber-500", label: "Open · past schedule", text: "text-amber-700" },
};

function stateOf(s: AgendaSession, now: number): State {
  if (s.status === "CLOSED") return "closed";
  const start = new Date(s.startsAt).getTime();
  const end = new Date(s.endsAt).getTime();
  if (now >= start && now <= end) return "live";
  if (now < start) return "upcoming";
  return "past";
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(d: Date, today: Date) {
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const key = dayKey(d);
  if (key === dayKey(today)) return "Today";
  if (key === dayKey(yesterday)) return "Yesterday";
  if (key === dayKey(tomorrow)) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function timeOf(value: string) {
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Session agenda — the schedule, not a list of buttons. Days group the rows,
 * a hairline rail links them, and the row being worked on is the only one with
 * a filled node. Works as a selector (`onSelect`) or as a link list (`hrefFor`).
 */
export function SessionAgenda({
  sessions,
  selectedId,
  onSelect,
  hrefFor,
  emptyLabel = "Nothing scheduled yet.",
}: {
  sessions: AgendaSession[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  hrefFor?: (session: AgendaSession) => string;
  emptyLabel?: string;
}) {
  if (sessions.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-[15px] text-slate-600">
        {emptyLabel}
      </p>
    );
  }

  const now = Date.now();
  const today = new Date();

  // Newest first within a day, days ordered by their most recent session.
  const sorted = [...sessions].sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  const groups: { key: string; label: string; items: AgendaSession[] }[] = [];
  for (const s of sorted) {
    const d = new Date(s.startsAt);
    const key = dayKey(d);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(s);
    else groups.push({ key, label: dayLabel(d, today), items: [s] });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {groups.map((group, gi) => (
        <div key={group.key} className={cn(gi > 0 && "border-t border-slate-100")}>
          <div className="flex items-center gap-3 bg-slate-50/80 px-4 py-2">
            <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate-500">{group.label}</span>
            <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
                      </div>

          <ul>
            {group.items.map((s, i) => {
              const state = stateOf(s, now);
              const on = selectedId === s.id;
              const inner = (
                <>
                  <span className="w-[66px] shrink-0 whitespace-nowrap text-right sm:w-[78px]">
                    <span className={cn("block text-[14.5px] font-semibold tabular-nums leading-tight sm:text-[15px]", on ? "text-blue-700" : "text-slate-900")}>
                      {timeOf(s.startsAt)}
                    </span>
                    <span className="block text-[12.5px] text-slate-500">{timeOf(s.endsAt)}</span>
                  </span>

                  {/* rail: hairline with a node; filled only for the active row */}
                  <span aria-hidden="true" className="relative flex w-4 shrink-0 justify-center self-stretch">
                    <span className={cn("w-px", i === group.items.length - 1 ? "bg-transparent" : "bg-slate-200")} />
                    <span
                      className={cn(
                        "absolute top-[18px] size-2.5 rounded-full ring-4",
                        on ? "bg-blue-600 ring-blue-100" : cn(TONE[state].dot, "ring-white"),
                      )}
                    />
                  </span>

                  <span className="min-w-0 flex-1 py-3 pr-4">
                    <span className={cn("block text-[16px] font-semibold leading-snug", on ? "text-blue-800" : "text-slate-900")}>
                      {s.title}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-slate-500">
                      <span className="font-bold uppercase tracking-[0.07em]">{s.type}</span>
                      <span aria-hidden="true" className="size-1 rounded-full bg-slate-300" />
                      <span className={cn("inline-flex items-center gap-1.5 font-semibold", TONE[state].text)}>
                        <span aria-hidden="true" className={cn("size-1.5 rounded-full", TONE[state].dot)} />
                        {TONE[state].label}
                      </span>
                    </span>
                  </span>

                </>
              );

              const rowClass = cn(
                "flex w-full items-stretch gap-3 pl-4 text-left transition-colors",
                on ? "bg-blue-50/70" : "hover:bg-slate-50",
                on && "shadow-[inset_3px_0_0_0_#2563eb]",
                i > 0 && "border-t border-slate-100",
              );

              return (
                <li key={s.id}>
                  {hrefFor ? (
                    <Link href={hrefFor(s)} className={rowClass}>
                      {inner}
                    </Link>
                  ) : (
                    <button type="button" aria-pressed={on} onClick={() => onSelect?.(s.id)} className={rowClass}>
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
