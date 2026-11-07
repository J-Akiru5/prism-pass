import { ok } from "@/lib/api";

export async function GET() {
  return ok({
    status: "ok",
    service: "prism-pass",
    phase: "p3-attendance",
    version: process.env.APP_VERSION ?? "0.0.0",
    time: new Date().toISOString(),
  });
}
