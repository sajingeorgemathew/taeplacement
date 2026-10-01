/**
 * The planning vocabulary.
 *
 * Batch Planning introduces NO new placement lifecycle status. Every count on
 * every card is one of the existing students.placement_status values from
 * PLACEMENT-01; this file only gives them the shorter labels a card has room
 * for, and fixes the order they are read in.
 *
 *   Documents Pending  documents_pending
 *   Ready              ready_for_placement
 *   Assigned           placement_assigned
 *   On Placement       placement_started
 *   Completed          placement_completed
 *
 * Those five are the lifecycle, in order, and they are the same five stages
 * the program dashboard shows (PROGRAM_PRIMARY_STAGES). Needs Review and On
 * Hold are real statuses too, but they are exceptions to the flow rather than
 * steps in it, so they sit on a quieter second line and never vanish from a
 * total.
 */

import type { PlacementStatus } from "@/lib/placement/constants";

/** The five lifecycle counts every Area card and the batch summary show. */
export const PLANNING_BREAKDOWN_STATUSES = [
  "documents_pending",
  "ready_for_placement",
  "placement_assigned",
  "placement_started",
  "placement_completed",
] as const;

/** The two exception statuses, shown on a second line. */
export const PLANNING_EXTRA_STATUSES = ["needs_review", "on_hold"] as const;

/** Short card labels. The long names stay in PLACEMENT_STATUS_LABELS. */
export const PLANNING_STATUS_LABELS: Record<PlacementStatus, string> = {
  needs_review: "Needs Review",
  documents_pending: "Documents Pending",
  ready_for_placement: "Ready",
  placement_assigned: "Assigned",
  placement_started: "On Placement",
  placement_completed: "Completed",
  on_hold: "On Hold",
};

/** The student filters offered inside a drill-down, lifecycle first. */
export const PLANNING_STUDENT_FILTERS = [
  "documents_pending",
  "ready_for_placement",
  "placement_assigned",
  "placement_started",
  "placement_completed",
  "needs_review",
  "on_hold",
] as const;

/**
 * The two planning exceptions, carried in the URL so the affected students can
 * be opened, shared, and reloaded like any other view.
 *
 * Neither is an area, and neither is ever guessed into one.
 */
export const PLANNING_EXCEPTIONS = ["unmapped", "missing"] as const;
export type PlanningException = (typeof PLANNING_EXCEPTIONS)[number];

export function isPlanningException(
  value: unknown,
): value is PlanningException {
  return (
    typeof value === "string" &&
    PLANNING_EXCEPTIONS.includes(value as PlanningException)
  );
}
