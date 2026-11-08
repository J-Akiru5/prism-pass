"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, IdCard, LayoutDashboard, Menu, Users } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "", label: "Home", icon: LayoutDashboard, color: "text-blue-600" },
  { href: "/people", label: "People", icon: Users, color: "text-violet-600" },
  { href: "/attendance", label: "Attend", icon: CalendarCheck, color: "text-teal-600" },
  { href: "/passes", label: "Passes", icon: IdCard, color: "text-amber-600" },
];

/**
 * Phone tab bar. Lives at the bottom of every signed-in surface — org console,
 * scanner and member portal — so navigation never disappears when a screen
 * leaves the shell. Hidden from tablet width up, where the side rail shows.
 */
export function MobileTabBar({ base, onMore, breakpoint = "md" }: { base?: string; onMore?: () => void; breakpoint?: "md" | "lg" }) {
  const pathname = usePathname();
  // On the standalone consoles the only tab that owns the screen is "More".
  const moreActive = !onMore && (pathname === "/scan" || pathname === "/member");

  if (!base) return null;

  const tab = (href: string, active: boolean) =>
    cn(
      "flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[12.5px] font-semibold transition-colors",
      active
        ? "bg-blue-50 text-blue-800 ring-1 ring-blue-100"
        : "text-slate-600 hover:bg-slate-100",
    );

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom,0px)] pt-1.5 backdrop-blur-xl",
        breakpoint === "lg" ? "lg:hidden" : "md:hidden",
      )}
    >
      <ul className="grid grid-cols-5 gap-1">
        {ITEMS.map(({ href, label, icon: Icon, color }) => {
          const to = `${base}${href}`;
          const active = href === "" ? pathname === base : pathname.startsWith(to);
          return (
            <li key={label}>
              <Link href={to} aria-current={active ? "page" : undefined} className={tab(href, active)}>
                <Icon className={cn("size-6", active ? color : "text-slate-500")} aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
        <li>
          {onMore ? (
            <button type="button" onClick={onMore} className={cn(tab("more", false), "w-full")}>
              <Menu className="size-6" aria-hidden="true" />
              More
            </button>
          ) : (
            <Link href={base} aria-current={moreActive ? "page" : undefined} className={tab("more", moreActive)}>
              <Menu className="size-6" aria-hidden="true" />
              More
            </Link>
          )}
        </li>
      </ul>
    </nav>
  );
}
