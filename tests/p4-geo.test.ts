import { describe, expect, it } from "vitest";
import {
  GEO_ACCURACY_THRESHOLD_M,
  evaluateGeo,
  haversineMeters,
  normalizeGeoMode,
  type GeofenceCircle,
} from "../modules/geo/evaluate";

// Manila campus fence used across cases.
const campus: GeofenceCircle = { id: "f-campus", centerLat: 14.5995, centerLng: 120.9842, radiusM: 100 };
const inside = { lat: 14.5995, lng: 120.9842, accuracyM: 10 };
const outside = { lat: 14.61, lng: 120.9842, accuracyM: 10 }; // ~1.17 km north

describe("haversineMeters", () => {
  it("is zero for the same point", () => {
    expect(haversineMeters({ lat: 14.5995, lng: 120.9842 }, { lat: 14.5995, lng: 120.9842 })).toBe(0);
  });

  it("matches a known distance (≈111.19 km per degree of longitude at the equator)", () => {
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111_195, -1);
  });

  it("is symmetric", () => {
    const a = { lat: 14.5995, lng: 120.9842 };
    const b = { lat: 14.61, lng: 120.99 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });
});

describe("normalizeGeoMode", () => {
  it("accepts only the documented policy strings and falls back to flag", () => {
    expect(normalizeGeoMode("off")).toBe("off");
    expect(normalizeGeoMode("flag")).toBe("flag");
    expect(normalizeGeoMode("enforce")).toBe("enforce");
    expect(normalizeGeoMode("ENFORCE")).toBe("flag");
    expect(normalizeGeoMode(undefined)).toBe("flag");
  });
});

describe("evaluateGeo: position outcomes", () => {
  it("inside the fence → VERIFIED with the matched fence", () => {
    const geo = evaluateGeo(inside, [campus], "flag");
    expect(geo.geoResult).toBe("VERIFIED");
    expect(geo.reason).toBe("inside");
    expect(geo.inside).toBe(true);
    expect(geo.matchedGeofenceId).toBe("f-campus");
    expect(geo.reject).toBe(false);
  });

  it("outside every fence → OUTSIDE_BOUNDARY", () => {
    const geo = evaluateGeo(outside, [campus], "flag");
    expect(geo.geoResult).toBe("OUTSIDE_BOUNDARY");
    expect(geo.reason).toBe("outside");
    expect(geo.inside).toBe(false);
    expect(geo.matchedGeofenceId).toBeNull();
    expect(geo.distanceM).toBeGreaterThan(campus.radiusM);
  });

  it("boundary is inclusive: distance <= radius is inside", () => {
    const point = { lat: 14.5995, lng: 120.9852 }; // ~108 m east
    const distance = haversineMeters({ lat: campus.centerLat, lng: campus.centerLng }, point);
    const justInside = { ...campus, id: "f-in", radiusM: Math.ceil(distance) };
    const justOutside = { ...campus, id: "f-out", radiusM: Math.max(1, Math.floor(distance) - 1) };
    expect(evaluateGeo({ ...point, accuracyM: 5 }, [justInside], "enforce").geoResult).toBe("VERIFIED");
    const outsideGeo = evaluateGeo({ ...point, accuracyM: 5 }, [justOutside], "enforce");
    expect(outsideGeo.geoResult).toBe("OUTSIDE_BOUNDARY");
    expect(outsideGeo.reject).toBe(true);
  });

  it("inside any of multiple fences wins and reports the closest containing fence", () => {
    const wide: GeofenceCircle = { id: "f-wide", centerLat: 14.5995, centerLng: 120.9842, radiusM: 2000 };
    const narrow: GeofenceCircle = { id: "f-narrow", centerLat: 14.5995, centerLng: 120.9842, radiusM: 500 };
    const geo = evaluateGeo(inside, [wide, narrow], "enforce");
    expect(geo.geoResult).toBe("VERIFIED");
    expect(geo.matchedGeofenceId).toBe("f-narrow");
  });

  it("missing or invalid coordinates → NOT_CAPTURED, never rejected", () => {
    for (const pos of [
      { accuracyM: 10 },
      { lat: null, lng: 120.9842, accuracyM: 10 },
      { lat: Number.NaN, lng: 120.9842, accuracyM: 10 },
      { lat: 95, lng: 120.9842, accuracyM: 10 },
      { lat: 14.5995, lng: 200, accuracyM: 10 },
    ]) {
      const geo = evaluateGeo(pos, [campus], "enforce");
      expect(geo.geoResult).toBe("NOT_CAPTURED");
      expect(geo.reject).toBe(false);
    }
  });

  it("no fences configured → NEEDS_REVIEW, never rejected even under enforce", () => {
    const geo = evaluateGeo(inside, [], "enforce");
    expect(geo.geoResult).toBe("NEEDS_REVIEW");
    expect(geo.reason).toBe("no_geofences");
    expect(geo.reject).toBe(false);
  });
});

describe("evaluateGeo: accuracy edge cases", () => {
  it("accuracy at the threshold is still acceptable", () => {
    const geo = evaluateGeo({ ...inside, accuracyM: GEO_ACCURACY_THRESHOLD_M }, [campus], "flag");
    expect(geo.geoResult).toBe("VERIFIED");
  });

  it("accuracy worse than the threshold → NEEDS_REVIEW, even when inside", () => {
    const geo = evaluateGeo({ ...inside, accuracyM: GEO_ACCURACY_THRESHOLD_M + 1 }, [campus], "enforce");
    expect(geo.geoResult).toBe("NEEDS_REVIEW");
    expect(geo.reason).toBe("accuracy_poor");
    expect(geo.reject).toBe(false);
  });

  it("unknown or invalid accuracy → NEEDS_REVIEW (approximate evidence)", () => {
    for (const accuracyM of [undefined, null, Number.NaN, -1]) {
      const geo = evaluateGeo({ lat: inside.lat, lng: inside.lng, accuracyM }, [campus], "enforce");
      expect(geo.geoResult).toBe("NEEDS_REVIEW");
      expect(geo.reason).toBe("accuracy_unknown");
      expect(geo.reject).toBe(false);
    }
  });

  it("poor accuracy outside the fence is review, not a rejection", () => {
    const geo = evaluateGeo({ ...outside, accuracyM: 500 }, [campus], "enforce");
    expect(geo.geoResult).toBe("NEEDS_REVIEW");
    expect(geo.reject).toBe(false);
  });
});

describe("evaluateGeo: geoMode policy", () => {
  it("off → NOT_CAPTURED regardless of coordinates and never rejects", () => {
    const geo = evaluateGeo(outside, [campus], "off");
    expect(geo.geoResult).toBe("NOT_CAPTURED");
    expect(geo.reason).toBe("mode_off");
    expect(geo.reject).toBe(false);
  });

  it("flag → outside accepted with OUTSIDE_BOUNDARY (no reject)", () => {
    const geo = evaluateGeo(outside, [campus], "flag");
    expect(geo.geoResult).toBe("OUTSIDE_BOUNDARY");
    expect(geo.reject).toBe(false);
  });

  it("enforce → outside rejected", () => {
    const geo = evaluateGeo(outside, [campus], "enforce");
    expect(geo.geoResult).toBe("OUTSIDE_BOUNDARY");
    expect(geo.reject).toBe(true);
  });

  it("enforce → inside still verified and accepted", () => {
    const geo = evaluateGeo(inside, [campus], "enforce");
    expect(geo.geoResult).toBe("VERIFIED");
    expect(geo.reject).toBe(false);
  });

  it("unknown policy string behaves as flag (accept + record)", () => {
    expect(evaluateGeo(outside, [campus], "bogus").reject).toBe(false);
    expect(evaluateGeo(outside, [campus], "bogus").geoResult).toBe("OUTSIDE_BOUNDARY");
  });
});
