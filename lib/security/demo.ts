// Demo-account guard. The owner explicitly wants the seeded `password123`
// accounts usable for now, so this module does not weaken or change them: it
// only makes the demo state visible and tells operators what to rotate.
// See docs/security/demo-accounts.md.

export const DEMO_MODE_ENV = "DEMO_MODE";

export const DEMO_ACCOUNTS = [
  "admin@syntaxure.dev (OWNER)",
  "user@syntaxure.dev (member)",
] as const;

export const DEMO_ACCOUNT_WARNING =
  "Demo mode: seeded demo accounts are active with a shared password. This deployment is not safe for real people, real attendance, or real client data. Rotate demo credentials before any pilot.";

/** Accepts 1/true/yes/on (case-insensitive). Everything else is off. */
export function isDemoMode(env: Record<string, string | undefined> = process.env): boolean {
  const value = env[DEMO_MODE_ENV];
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

/** Returns the startup warning to log, or null when demo mode is off. */
export function demoModeWarning(env: Record<string, string | undefined> = process.env): string | null {
  if (!isDemoMode(env)) return null;
  return `[prism-pass][security] ${DEMO_ACCOUNT_WARNING} Accounts: ${DEMO_ACCOUNTS.join(", ")}. Set ${DEMO_MODE_ENV}=false after rotation.`;
}
