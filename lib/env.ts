import { z } from "zod";
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional().default("http://localhost:54321"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional().default("anon-key-placeholder"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  APP_URL: z.string().optional().default("http://localhost:3000"),
});
export const env = schema.parse(process.env);
export function assertServerEnv() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) console.warn("[prism-pass] SUPABASE_SERVICE_ROLE_KEY missing — server writes disabled (foundation mode).");
}
