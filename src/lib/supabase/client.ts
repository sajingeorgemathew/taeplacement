"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";
import { requireSupabaseEnv } from "./env";

/**
 * Supabase client for the browser. Uses the public anon key only, so every
 * request is still filtered by Row Level Security.
 */
export function createSupabaseBrowserClient() {
  const { url, anonKey } = requireSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey);
}
