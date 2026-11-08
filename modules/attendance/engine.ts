import { z } from "zod";
import { geoModeSchema } from "../geo/schema";

// Single canonical attendance engine (P2/P3 contracts). One path for employees,
// interns, and event participants — group membership lives in person_assignments,
// never in separate engines/tables/routes.

export const createPolicyInput = z.object({
  name: z.string().min(1).max(120),
  graceMin: z.number().int().min(0).max(480).default(10),
  lateThresholdMin: z.number().int().min(0).max(480).default(15),
  duplicateWindowSec: z.number().int().min(10).max(3600).default(120),
  geoMode: geoModeSchema.default("flag"),
  evidenceRequired: z.array(z.unknown()).default([]),
  approvalSteps: z.array(z.unknown()).default([]),
});
export type CreatePolicyInput = z.infer<typeof createPolicyInput>;

export const createSessionInput = z.object({
  policyId: z.string().min(1),
  type: z.enum(["EVENT", "OJT", "SHIFT", "CLASS", "VISITOR", "TRAINING"]).default("EVENT"),
  title: z.string().min(1).max(200),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timezone: z.string().min(1).max(60).default("Asia/Manila"),
}).refine((v) => new Date(v.endsAt) > new Date(v.startsAt), { message: "endsAt must be after startsAt" });
export type CreateSessionInput = z.infer<typeof createSessionInput>;

export const scanInput = z.object({
  credential: z.string().min(8).max(512),
  clientTs: z.string().datetime(),
  direction: z.enum(["auto", "in", "out"]).default("auto"),
  idempotencyKey: z.string().uuid().optional(),
  geo: z
    .object({
      lat: z.number().finite().min(-90).max(90),
      lng: z.number().finite().min(-180).max(180),
      accuracyM: z.number().finite().min(0).max(100_000).optional(),
    })
    .optional(),
  deviceId: z.string().max(120).optional(),
  networkState: z.string().max(20).default("online"),
});
export type ScanInput = z.infer<typeof scanInput>;

export type Lateness = "PRESENT" | "LATE" | "ABSENT";
export function evaluateLateness(checkIn: Date, startsAt: Date, graceMin: number, lateThresholdMin: number): Lateness {
  const diffMin = (checkIn.getTime() - startsAt.getTime()) / 60000;
  if (diffMin <= graceMin) return "PRESENT";
  if (diffMin <= graceMin + lateThresholdMin) return "LATE";
  return "ABSENT";
}

export function resolveDirection(requested: "auto" | "in" | "out", hasCheckIn: boolean): "CHECK_IN" | "CHECK_OUT" {
  if (requested === "in") return "CHECK_IN";
  if (requested === "out") return "CHECK_OUT";
  return hasCheckIn ? "CHECK_OUT" : "CHECK_IN";
}

export function reconcileRecord(
  prev: { checkInAt: Date | null; checkOutAt: Date | null },
  eventType: "CHECK_IN" | "CHECK_OUT",
  eventAt: Date,
  sessionStartsAt: Date,
  graceMin: number,
  lateThresholdMin: number,
) {
  const checkInAt = eventType === "CHECK_IN" ? eventAt : prev.checkInAt;
  const checkOutAt = eventType === "CHECK_OUT" ? eventAt : prev.checkOutAt;
  const durationMin =
    checkInAt && checkOutAt ? Math.max(0, Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000)) : null;
  const status = checkInAt ? evaluateLateness(checkInAt, sessionStartsAt, graceMin, lateThresholdMin) : "ABSENT";
  return { checkInAt, checkOutAt, durationMin, status };
}
