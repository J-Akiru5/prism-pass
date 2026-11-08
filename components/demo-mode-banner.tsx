import { DEMO_ACCOUNT_WARNING, isDemoMode } from "@/lib/security/demo";

/**
 * Server-rendered banner for demo deployments. Gated by DEMO_MODE, so a
 * production deployment without the flag renders nothing and carries no extra
 * client JavaScript.
 */
export function DemoModeBanner() {
  if (!isDemoMode(process.env)) return null;
  return (
    <div
      role="status"
      className="border-b border-amber-500/50 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950 dark:bg-amber-900/40 dark:text-amber-50"
    >
      {DEMO_ACCOUNT_WARNING}
    </div>
  );
}
