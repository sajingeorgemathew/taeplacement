import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./database.types";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/**
 * Refreshes the Supabase session cookies on every request and reports whether
 * the request currently has a signed in user.
 *
 * The returned response carries the refreshed cookies, so callers must either
 * return it or copy its cookies onto the response they return instead.
 */
export async function updateSupabaseSession(request: NextRequest): Promise<{
  response: NextResponse;
  isSignedIn: boolean;
}> {
  const response = NextResponse.next({ request });

  if (!isSupabaseConfigured) {
    return { response, isSignedIn: false };
  }

  const supabase = createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser revalidates the token with Supabase Auth rather than trusting the
  // cookie contents.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, isSignedIn: Boolean(user) };
}
