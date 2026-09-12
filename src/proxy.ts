import { NextResponse, type NextRequest } from "next/server";

import { updateSupabaseSession } from "@/lib/supabase/proxy";

/**
 * Keeps the Supabase session fresh and sends signed out staff to /login.
 *
 * This is an optimistic check only. Every page and action also verifies the
 * session on the server, and Row Level Security is the real boundary.
 */

/** Routes that a signed out visitor is allowed to reach. */
const PUBLIC_PATHS = ["/login", "/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function proxy(request: NextRequest) {
  const { response, isSignedIn } = await updateSupabaseSession(request);
  const { pathname, search } = request.nextUrl;

  if (!isSignedIn && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    const target = `${pathname}${search}`;
    if (target !== "/") {
      loginUrl.searchParams.set("next", target);
    }
    const redirectResponse = NextResponse.redirect(loginUrl);
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  }

  if (isSignedIn && pathname === "/login") {
    const redirectResponse = NextResponse.redirect(
      new URL("/dashboard", request.url),
    );
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  }

  return response;
}

export const config = {
  /**
   * Run on everything except Next.js internals and static files. Student data
   * is never served from a static asset, so nothing private is skipped here.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
