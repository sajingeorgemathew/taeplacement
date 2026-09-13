/**
 * The four counts behind the Placement Dashboard.
 *
 * Nothing is computed or stored here. Each number is a plain count over data
 * that already exists, read through the normal server client so Row Level
 * Security applies exactly as it does everywhere else.
 *
 * Two vocabularies are in play and they are NOT interchangeable, so the counts
 * below are deliberately drawn from both:
 *
 *   students.placement_status        the student's whole placement requirement
 *   student_placements.status        one placement segment at one partner
 *
 * Ready for Placement is a question about students who have no partner yet, so
 * it reads the first. Awaiting Start and On Placement are questions about live
 * placement records, so they read the second.
 */

import { requireActiveStaff } from "@/lib/auth/session";
import { PLACEMENT_READY_STATUS } from "@/lib/placement/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DashboardSummary = {
  /** Active students with documents complete and no partner yet. */
  readyForPlacement: number;
  /** Live placement records where the student has not started yet. */
  awaitingStart: number;
  /** Live placement records where the student is on placement right now. */
  onPlacement: number;
  /** Partners whose follow-up date has arrived or passed. */
  followUpsDue: number;
};

/**
 * The inclusive upper bound for "a follow-up that is due".
 *
 * placement_partners.next_follow_up_at is a timestamptz, but it only ever holds
 * UTC midnight of a chosen DAY (see optionalDate in @/lib/partners/schema).
 * The rest of the application reads it as a day pinned to UTC, so the boundary
 * is the END of today in UTC. Comparing against now() instead would hide a
 * follow-up booked for today until the clock passed it, which is wrong: a
 * follow-up due today is due all day.
 */
function endOfTodayUtc(): string {
  return `${new Date().toISOString().slice(0, 10)}T23:59:59.999Z`;
}

/** One small read per card, in parallel. */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const [ready, awaitingStart, onPlacement, followUpsDue] = await Promise.all([
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("placement_status", PLACEMENT_READY_STATUS),

    // "assigned" and "started" are already the two ACTIVE record statuses, so
    // matching one of them is by itself a current placement. Finished segments
    // are never any of them and so can never reach these counts.
    supabase
      .from("student_placements")
      .select("id", { count: "exact", head: true })
      .eq("status", "assigned"),

    supabase
      .from("student_placements")
      .select("id", { count: "exact", head: true })
      .eq("status", "started"),

    // Archived partners have left the board, so they are not work anybody owes
    // a phone call. A partner that has merely gone quiet (relationship_status
    // "inactive") is deliberately still counted: they are exactly who a due
    // follow-up is for.
    supabase
      .from("placement_partners")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .neq("relationship_status", "archived")
      .not("next_follow_up_at", "is", null)
      .lte("next_follow_up_at", endOfTodayUtc()),
  ]);

  for (const result of [ready, awaitingStart, onPlacement, followUpsDue]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    readyForPlacement: ready.count ?? 0,
    awaitingStart: awaitingStart.count ?? 0,
    onPlacement: onPlacement.count ?? 0,
    followUpsDue: followUpsDue.count ?? 0,
  };
}
