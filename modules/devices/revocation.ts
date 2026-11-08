// Pure device revocation and sync-rejection policy.
//
// A device is identified by its internal id or its public id, and is revoked by
// setting `revokedAt` (there is no un-revoke). Revocation is idempotent: a
// second call reports `already: true` and preserves the original timestamp.
//
// The stored `secretHash` is a verifier, never a usable secret, and it is never
// part of an API summary. Revocation also clears it as defence in depth so any
// code path that forgets the revoked check still cannot verify a signature.

export const DEVICE_ERROR_CODES = {
  notFound: "DEVICE_NOT_FOUND",
  revoked: "DEVICE_REVOKED",
  unregistered: "DEVICE_UNREGISTERED",
} as const;

export type DeviceRecord = {
  id?: string;
  devicePublicId?: string;
  role?: string | null;
  revokedAt?: Date | string | null;
  secretHash?: string | null;
  lastSeenAt?: Date | string | null;
  lastSyncAt?: Date | string | null;
};

export type DeviceSyncRejection = {
  status: 403 | 404;
  code: (typeof DEVICE_ERROR_CODES)[keyof typeof DEVICE_ERROR_CODES];
  message: string;
  /** Matches the `audit_logs.result` written by sync/batches. */
  reason: "device_not_found" | "device_revoked" | "device_unregistered";
};

export type DeviceSummary = {
  id: string | null;
  devicePublicId: string | null;
  role: string;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  revoked: boolean;
  revokedAt: string | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function iso(value: Date | string | null | undefined): string | null {
  return toDate(value)?.toISOString() ?? null;
}

export function isDeviceRevoked(device: DeviceRecord | null | undefined): boolean {
  return toDate(device?.revokedAt) !== null;
}

export type RevocationOutcome = {
  revoked: true;
  /** True when the device was already revoked; the timestamp is preserved. */
  already: boolean;
  revokedAt: Date;
};

/**
 * Decide the revocation transition without writing anything. The caller passes
 * the clock so the result is deterministic in tests.
 */
export function evaluateDeviceRevocation(
  device: DeviceRecord,
  now: Date | string = new Date(),
): RevocationOutcome {
  const existing = toDate(device.revokedAt);
  if (existing) return { revoked: true, already: true, revokedAt: existing };
  const at = toDate(now);
  if (!at) throw new Error("Invalid revocation timestamp");
  return { revoked: true, already: false, revokedAt: at };
}

/**
 * Sync admission check. Returns null when the device may sign a batch, or the
 * exact API rejection. A revoked device gets its own code (`DEVICE_REVOKED`) so
 * clients can stop retrying instead of treating it as a transient 403.
 */
export function deviceSyncRejection(device: DeviceRecord | null | undefined): DeviceSyncRejection | null {
  if (!device) {
    return {
      status: 404,
      code: DEVICE_ERROR_CODES.notFound,
      message: "Unknown device in this organization",
      reason: "device_not_found",
    };
  }
  if (isDeviceRevoked(device)) {
    return {
      status: 403,
      code: DEVICE_ERROR_CODES.revoked,
      message: "Device is revoked",
      reason: "device_revoked",
    };
  }
  if (!device.secretHash) {
    return {
      status: 403,
      code: DEVICE_ERROR_CODES.unregistered,
      message: "Device has no signing key; register it again",
      reason: "device_unregistered",
    };
  }
  return null;
}

/**
 * API projection for device listings. Every field is explicit: `secretHash`,
 * `keyRef` and any future credential column can never leak by accident.
 */
export function toDeviceSummary(device: DeviceRecord): DeviceSummary {
  return {
    id: device.id ?? null,
    devicePublicId: device.devicePublicId ?? null,
    role: device.role ?? "scanner",
    lastSeenAt: iso(device.lastSeenAt),
    lastSyncAt: iso(device.lastSyncAt),
    revoked: isDeviceRevoked(device),
    revokedAt: iso(device.revokedAt),
  };
}
