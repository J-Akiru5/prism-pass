/**
 * Next.js startup hook. Logs one loud warning when demo accounts are enabled.
 * No network, no database, no secrets: safe to run on every cold start.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { demoModeWarning } = await import("./lib/security/demo");
  const warning = demoModeWarning(process.env);
  if (warning) console.warn(warning);
}
