import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, ForbiddenError } from "@/lib/tenant";
export function ok(data: unknown, meta?: unknown) { return NextResponse.json({ data, ...(meta ? { meta } : {}) }); }
export function fail(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}
export function handleRouteError(e: unknown) {
  if (e instanceof AuthError) return fail(401, "UNAUTHENTICATED", e.message);
  if (e instanceof ForbiddenError) return fail(403, "FORBIDDEN", e.message);
  if (e instanceof z.ZodError) return fail(400, "INVALID_INPUT", "Validation failed", e.flatten());
  console.error(e);
  return fail(500, "INTERNAL", "Unexpected error");
}
export const pagination = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });
