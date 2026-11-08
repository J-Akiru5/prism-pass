/**
 * Deployment identity shared by `/api/v1/health` and the platform health view.
 * Keeping the phase in one place means the public probe and the console cannot
 * disagree about what is deployed.
 */
export const APP_SERVICE = "prism-pass";
export const APP_PHASE = "p9-hardening";

export function appVersion(): string {
  return process.env.APP_VERSION ?? "0.0.0";
}

export function healthPayload(now: Date = new Date()) {
  return {
    status: "ok" as const,
    service: APP_SERVICE,
    phase: APP_PHASE,
    version: appVersion(),
    time: now.toISOString(),
  };
}
