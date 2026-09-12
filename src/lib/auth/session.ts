import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import type { ProfileRow } from "@/lib/supabase/database.types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StaffSession = {
  userId: string;
  email: string | null;
  profile: ProfileRow | null;
};

/**
 * The signed in staff member, or null.
 *
 * Cached per request so a layout and its pages do not each call Supabase Auth.
 */
export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  // Read cookies first so any page that checks the session is always rendered
  // per request, even when Supabase configuration is missing.
  await cookies();
  if (!isSupabaseConfigured) return null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: profile ?? null,
  };
});

/** True when the signed in staff member has been activated by an admin. */
export function isActiveStaff(session: StaffSession | null): boolean {
  return Boolean(session?.profile?.is_active);
}

export function isAdmin(session: StaffSession | null): boolean {
  return Boolean(session?.profile?.is_active && session.profile.role === "admin");
}

/**
 * Guard for pages and actions that read or write student data.
 * Redirects to /login when there is no session and stops the request when the
 * staff account has not been activated.
 */
export async function requireActiveStaff(): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  if (!isActiveStaff(session)) redirect("/account-pending");
  return session;
}

/** Display name for the signed in staff member. */
export function staffDisplayName(session: StaffSession | null): string {
  if (!session) return "Staff";
  const name = session.profile?.full_name?.trim();
  if (name) return name;
  return session.email ?? "Staff";
}
