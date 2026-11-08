// Per-tab device signing context for offline sync.
//
// Deliberately separate from `lib/sync-client.ts`: the sync module only accepts
// a caller-supplied context and never reads browser storage itself. This module
// is the scanner page's provisioning store. It uses sessionStorage (survives a
// reload, cleared when the tab closes) because the secret is a live signing
// credential; keeping it out of localStorage limits its lifetime on disk.
// The raw secret is never logged and never written to the queue.

export type DeviceContext = {
  deviceId: string;
  deviceSecret: string;
};

const STORAGE_PREFIX = "prism-pass:device-key:v1:";
const SECRET_PATTERN = /^[a-f0-9]{64}$/i;

export type DeviceContextParse =
  | { ok: true; value: DeviceContext }
  | { ok: false; error: string };

/** Validate values pasted from the one-time device registration response. */
export function parseDeviceContext(deviceId: string, deviceSecret: string): DeviceContextParse {
  const id = deviceId.trim();
  const secret = deviceSecret.trim();
  if (!id) return { ok: false, error: "Device id is required." };
  if (id.length > 120) return { ok: false, error: "Device id is too long (120 characters maximum)." };
  if (!secret) return { ok: false, error: "Device secret is required." };
  if (!SECRET_PATTERN.test(secret)) {
    return { ok: false, error: "Device secret must be the 64-character hex value issued at registration." };
  }
  return { ok: true, value: { deviceId: id, deviceSecret: secret } };
}

export function deviceContextStorageKey(organizationId: string): string {
  return `${STORAGE_PREFIX}${organizationId}`;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadDeviceContext(organizationId: string): DeviceContext | null {
  if (!organizationId) return null;
  try {
    const raw = storage()?.getItem(deviceContextStorageKey(organizationId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { deviceId, deviceSecret } = parsed as Record<string, unknown>;
    if (typeof deviceId !== "string" || typeof deviceSecret !== "string") return null;
    const validated = parseDeviceContext(deviceId, deviceSecret);
    return validated.ok ? validated.value : null;
  } catch {
    return null;
  }
}

export function saveDeviceContext(organizationId: string, context: DeviceContext): void {
  const validated = parseDeviceContext(context.deviceId, context.deviceSecret);
  if (!validated.ok) throw new Error(validated.error);
  storage()?.setItem(deviceContextStorageKey(organizationId), JSON.stringify(validated.value));
}

export function clearDeviceContext(organizationId: string): void {
  try {
    storage()?.removeItem(deviceContextStorageKey(organizationId));
  } catch {
    // Storage unavailable: nothing to forget.
  }
}
