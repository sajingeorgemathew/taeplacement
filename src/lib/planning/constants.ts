/**
 * The planning vocabulary.
 *
 * Batch Planning introduces NO new placement lifecycle status. Every count on
 * every card is one of the existing students.placement_status values from
 * PLACEMENT-01; this file only gives them the shorter labels a card has room
 * for, and fixes the order they are read in.
 *
 *   Ready              ready_for_placement
 *   Docs Pending       documents_pending
 *   Awaiting Start     placement_assigned
 *   On Placement       placement_started
 *   On Hold            on_hold
 *
 * Needs Review and Completed are real statuses too. They are not part of the
 * five a planner scans for, so they are only shown when a batch actually
 * contains one, which keeps a card calm without ever making a student vanish
 * from a total.
 */

import type { PlacementStatus } from "@/lib/placement/constants";

/** The five counts every Area card and the batch summary always show. */
export const PLANNING_BREAKDOWN_STATUSES = [
  "ready_for_placement",
  "documents_pending",
  "placement_assigned",
  "placement_started",
  "on_hold",
] as const;

/** Shown beside the five above only when the batch has one. */
export const PLANNING_EXTRA_STATUSES = [
  "needs_review",
  "placement_completed",
] as const;

/** Short card labels. The long names stay in PLACEMENT_STATUS_LABELS. */
export const PLANNING_STATUS_LABELS: Record<PlacementStatus, string> = {
  needs_review: "Needs Review",
  documents_pending: "Docs Pending",
  ready_for_placement: "Ready",
  placement_assigned: "Awaiting Start",
  placement_started: "On Placement",
  placement_completed: "Completed",
  on_hold: "On Hold",
};

/** The student filters offered inside an Area drill-down. */
export const PLANNING_STUDENT_FILTERS = [
  "ready_for_placement",
  "documents_pending",
  "placement_assigned",
  "placement_started",
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
