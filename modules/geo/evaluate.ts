// Pure geo-verification module (P4). No Prisma, no network, no clock: callers pass
// raw coordinates + the org's configured circular fences and the result is derived
// here. A client-supplied "inside" boolean is never accepted as evidence.

// Mirrors the Prisma `GeoResult` enum without importing the generated client,
// so this module stays pure and unit-testable.
export type GeoResultValue = "VERIFIED" | "NEEDS_REVIEW" | "OUTSIDE_BOUNDARY" | "MANUAL_EXCEPTION" | "NOT_CAPTURED";

// Policy strings are defined by AttendancePolicy.geoMode (see docs/architecture/geoverification.md).
export type GeoMode = "off" | "flag" | "enforce";

export type GeoReason =
  | "mode_off"
  | "not_captured"
  | "no_geofences"
  | "accuracy_unknown"
  | "accuracy_poor"
  | "inside"
  | "outside";

export type GeoPosition = { lat?: number | null; lng?: number | null; accuracyM?: number | null };

// Structural subset of the `Geofence` model; extra Prisma columns are ignored.
export type GeofenceCircle = { id: string; centerLat: number; centerLng: number; radiusM: number };

export type GeoOutcome = {
  geoResult: GeoResultValue;
  reason: GeoReason;
  /** true/false only when a boundary could be evaluated; null when it could not. */
  inside: boolean | null;
  /** Closest fence containing the position (only when inside). */
  matchedGeofenceId: string | null;
  /** Distance in metres to the matched fence, or to the nearest fence when outside. */
  distanceM: number | null;
  /** True only for a reliable out-of-boundary position under `enforce`. */
  reject: boolean;
};

/** Positions with an OS accuracy worse than this are not reliable enough to verify. */
export const GEO_ACCURACY_THRESHOLD_M = 100;

const EARTH_RADIUS_M = 6_371_000;

const toRadians = (deg: number) => (deg * Math.PI) / 180;

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Unknown/typo'd policy values fall back to `flag`: accept + record, never silently reject. */
export function normalizeGeoMode(mode: string | null | undefined): GeoMode {
  return mode === "off" || mode === "enforce" ? mode : "flag";
}

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function outcome(geoResult: GeoResultValue, reason: GeoReason): GeoOutcome {
  return { geoResult, reason, inside: null, matchedGeofenceId: null, distanceM: null, reject: false };
}

/**
 * Server-side geofence evaluation.
 *
 * Order of precedence:
 * 1. `off`                  -> NOT_CAPTURED (verification disabled)
 * 2. no/invalid coords      -> NOT_CAPTURED (never auto-reject; review path)
 * 3. no configured fences   -> NEEDS_REVIEW (cannot verify; never reject)
 * 4. accuracy missing/poor  -> NEEDS_REVIEW (approximate evidence)
 * 5. inside any fence       -> VERIFIED (closest containing fence)
 * 6. outside every fence    -> OUTSIDE_BOUNDARY (reject only under `enforce`)
 */
export function evaluateGeo(
  position: GeoPosition,
  geofences: readonly GeofenceCircle[],
  geoMode: string | null | undefined,
): GeoOutcome {
  const mode = normalizeGeoMode(geoMode);
  if (mode === "off") return outcome("NOT_CAPTURED", "mode_off");

  const { lat, lng } = position;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return outcome("NOT_CAPTURED", "not_captured");
  }

  const fences = geofences.filter(
    (f) =>
      typeof f.id === "string" &&
      f.id.length > 0 &&
      isFiniteNumber(f.centerLat) &&
      isFiniteNumber(f.centerLng) &&
      f.centerLat >= -90 &&
      f.centerLat <= 90 &&
      f.centerLng >= -180 &&
      f.centerLng <= 180 &&
      isFiniteNumber(f.radiusM) &&
      f.radiusM > 0,
  );
  if (fences.length === 0) return outcome("NEEDS_REVIEW", "no_geofences");

  const accuracy = position.accuracyM;
  if (!isFiniteNumber(accuracy) || accuracy < 0) return outcome("NEEDS_REVIEW", "accuracy_unknown");
  if (accuracy > GEO_ACCURACY_THRESHOLD_M) return outcome("NEEDS_REVIEW", "accuracy_poor");

  const point = { lat, lng };
  let nearest: { id: string; distance: number } | null = null;
  let containing: { id: string; distance: number } | null = null;

  for (const fence of fences) {
    const distance = haversineMeters(point, { lat: fence.centerLat, lng: fence.centerLng });
    if (!nearest || distance < nearest.distance || (distance === nearest.distance && fence.id < nearest.id)) {
      nearest = { id: fence.id, distance };
    }
    if (
      distance <= fence.radiusM &&
      (!containing || distance < containing.distance || (distance === containing.distance && fence.id < containing.id))
    ) {
      containing = { id: fence.id, distance };
    }
  }

  // Defensive: only possible if every fence was filtered out above.
  if (!nearest) return outcome("NEEDS_REVIEW", "no_geofences");

  if (containing) {
    return {
      geoResult: "VERIFIED",
      reason: "inside",
      inside: true,
      matchedGeofenceId: containing.id,
      distanceM: containing.distance,
      reject: false,
    };
  }

  return {
    geoResult: "OUTSIDE_BOUNDARY",
    reason: "outside",
    inside: false,
    matchedGeofenceId: null,
    distanceM: nearest.distance,
    reject: mode === "enforce",
  };
}
