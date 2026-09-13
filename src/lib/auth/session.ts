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
 * Who may change placement documents.
 *
 * Management can read student readiness but does not update statuses or touch
 * files. This mirrors public.can_manage_documents() in the database, which is
 * the policy that actually enforces it.
 */
export function canManageDocuments(session: StaffSession | null): boolean {
  const role = session?.profile?.role;
  return Boolean(
    session?.profile?.is_active &&
      (role === "admin" || role === "placement_manager"),
  );
}

/**
 * Who may change the placement partner network.
 *
 * Management reads partners, contacts, and notes but does not create or edit
 * them. This mirrors public.can_manage_partners() in the database, which is the
 * policy that actually enforces it. Configuring the AREA DEFINITIONS is admin
 * only and uses isAdmin() instead.
 */
export function canManagePartners(session: StaffSession | null): boolean {
  const role = session?.profile?.role;
  return Boolean(
    session?.profile?.is_active &&
      (role === "admin" || role === "placement_manager"),
  );
}

/**
 * Who may change placement assignments.
 *
 * Management reads the Placement Board, a student's placement, and a partner's
 * current students, but does not assign, cancel, change planned dates, or hold
 * a student. This mirrors public.can_manage_placements() in the database, which
 * together with the students guard trigger in 0006 is what actually enforces
 * it.
 */
export function canManagePlacements(session: StaffSession | null): boolean {
  const role = session?.profile?.role;
  return Boolean(
    session?.profile?.is_active &&
      (role === "admin" || role === "placement_manager"),
  );
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
