import { ok } from "@/lib/api";
import { healthPayload } from "@/lib/health";

export async function GET() {
  return ok(healthPayload());
}
