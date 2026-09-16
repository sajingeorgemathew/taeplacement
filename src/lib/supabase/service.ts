import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { SUPABASE_URL } from "./env";

/**
 * Supabase client that bypasses Row Level Security.
 *
 * There is exactly ONE caller: the Resend webhook route, which has no signed in
 * staff member behind it and still has to advance a delivery status. Everything
 * a person does goes through createSupabaseServerClient() and the anon key, so
 * Row Level Security keeps deciding what staff may read and write.
 *
 * `server-only` is what keeps the service role key out of the browser bundle at
 * build time rather than by convention. Nothing here is read at module load, so
 * a machine with no service role key builds and runs normally.
 *
 * The webhook only ever UPDATES student_email_log rows it can find by provider
 * id. It creates nothing, and 0008 has a delete trigger that refuses this
 * credential too, so bypassing policies cannot turn into erasing history.
 */
export function createSupabaseServiceRoleClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!SUPABASE_URL || !serviceKey) return null;

  return createClient<Database>(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
