import { z } from "zod";
import type { GeoMode } from "./evaluate";

// Exact policy strings supported by evaluateGeo (docs/architecture/geoverification.md).
export const geoModeSchema = z.enum(["off", "flag", "enforce"]);
export const GEO_MODES: readonly GeoMode[] = ["off", "flag", "enforce"];

const geofenceFields = {
  label: z.string().trim().min(1).max(120),
  centerLat: z.number().finite().min(-90).max(90),
  centerLng: z.number().finite().min(-180).max(180),
  radiusM: z.number().int().min(1).max(10_000),
  campusId: z.string().min(1).nullable(),
};

export const createGeofenceInput = z.object({
  ...geofenceFields,
  radiusM: geofenceFields.radiusM.default(100),
  campusId: geofenceFields.campusId.optional(),
});
export type CreateGeofenceInput = z.infer<typeof createGeofenceInput>;

export const updateGeofenceInput = z
  .object(geofenceFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });
export type UpdateGeofenceInput = z.infer<typeof updateGeofenceInput>;
