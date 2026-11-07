import { z } from "zod";
export const recordScanInput = z.object({
  organizationId: z.string().min(1),
  sessionId: z.string().min(1),
  credentialId: z.string().min(1),
  idempotencyKey: z.string().uuid(),
  clientTs: z.string().datetime(),
  geo: z.object({ lat: z.number(), lng: z.number(), accuracyM: z.number().optional() }).optional(),
  deviceId: z.string().optional(),
});
// Single attendance engine (ADR-01/06): events append-only, records reconciled. DB wiring in P1-next.
export type RecordScanInput = z.infer<typeof recordScanInput>;
export function evaluateLateness(checkIn: Date, startsAt: Date, graceMin: number, lateThresholdMin: number) {
  const diffMin = (checkIn.getTime() - startsAt.getTime()) / 60000;
  if (diffMin <= graceMin) return "PRESENT" as const;
  if (diffMin <= graceMin + lateThresholdMin) return "LATE" as const;
  return "ABSENT" as const;
}
export function isDuplicateScan(lastScanAt: number, now: number, windowSec = 120) {
  return now - lastScanAt < windowSec * 1000;
}
