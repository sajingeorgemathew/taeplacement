/**
 * The reads behind the Placement Dashboard.
 *
 * Nothing is computed or stored here. Each number is a plain count over data
 * that already exists, read through the normal server client so Row Level
 * Security applies exactly as it does everywhere else.
 *
 * The main summary is PROGRAM FIRST and it is scoped to CURRENT placement
 * operations. That scope is one rule, defined once in
 * @/lib/placement/operations and never restated here:
 *
 *   students.is_active
 *   AND students.batch_id -> batches.status = active
 *   AND batches.placement_tracking_enabled = true
 *
 * Older batches that nobody has switched on are still in the database and
 * still browsable everywhere else; they are simply not today's work, so they
 * do not appear in these counts. students.placement_status is used as stored.
 * Nothing here derives a placement status from documents or placement records.
 */

import { requireActiveStaff } from "@/lib/auth/session";
import {
  buildProgramOperationsSummary,
  type ProgramOperationsSummaries,
  type SummaryBatchShape,
  type SummaryStudentShape,
} from "@/lib/placement/operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * One summary per supported program, always present, zeros when a program has
 * no tracked students yet.
 *
 * Two small reads, no join and no per-batch query: the batch list (a few dozen
 * rows) and the active roster's four relevant columns (a few hundred rows),
 * rolled up in memory by the pure builder.
 */
export async function getProgramOperationsSummary(): Promise<ProgramOperationsSummaries> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const [batches, students] = await Promise.all([
    supabase
      .from("batches")
      .select("id, status, placement_tracking_enabled"),
    supabase
      .from("students")
      .select("batch_id, program, placement_status, is_active")
      .eq("is_active", true),
  ]);

  if (batches.error) throw new Error(batches.error.message);
  if (students.error) throw new Error(students.error.message);

  return buildProgramOperationsSummary(
    (students.data ?? []) as SummaryStudentShape[],
    (batches.data ?? []) as SummaryBatchShape[],
  );
}

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

/**
 * Partners whose follow-up date has arrived or passed.
 *
 * Archived partners have left the board, so they are not work anybody owes a
 * phone call. A partner that has merely gone quiet (relationship_status
 * "inactive") is deliberately still counted: they are exactly who a due
 * follow-up is for.
 */
export async function getPartnerFollowUpsDue(): Promise<number> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { count, error } = await supabase
    .from("placement_partners")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .neq("relationship_status", "archived")
    .not("next_follow_up_at", "is", null)
    .lte("next_follow_up_at", endOfTodayUtc());

  if (error) throw new Error(error.message);
  return count ?? 0;
}
