import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./database.types";
import { requireSupabaseEnv } from "./env";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 *
 * A new client is created for every request. Never cache or share one.
 * Only the anon key is used here, so Row Level Security always applies.
 */
export async function createSupabaseServerClient() {
  const { url, anonKey } = requireSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. src/proxy.ts refreshes the
          // session on every request, so this is safe to ignore here.
        }
      },
    },
  });
}
