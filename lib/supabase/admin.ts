import "server-only";
import { createClient } from "@supabase/supabase-js";
import { assertServerEnv } from "@/lib/env";
// Strict deny + service-role: server-only, never import in client components.
export function createAdminClient() {
  assertServerEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!key || key.includes("placeholder")) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing — cannot perform server writes.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
