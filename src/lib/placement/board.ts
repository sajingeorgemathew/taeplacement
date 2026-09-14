/**
 * The Placement Board's columns, and the rules about what a drag may do.
 *
 * The board is the operational answer to one question: which student needs a
 * placement, what has already been assigned, and who is actually out on
 * placement right now. Its six working columns are the six states a student can
 * be worked on in.
 *
 * A student whose placement finishes WITHOUT finishing their requirement comes
 * straight back to one of these columns, usually Ready for Placement, so they
 * can be placed at another partner. Only a student whose whole requirement is
 * complete leaves the board: they are history, reachable through List View and
 * their own placement history, and they must not crowd the live board.
 *
 * Colour comes from the same controlled palette as the Partner Area Board, so
 * the two boards read as one product and there is no second table of class
 * strings to keep in step.
 */

import type { AreaColorKey, PlacementStatus } from "@/lib/placement/constants";

export type BoardColumn = {
  status: PlacementStatus;
  label: string;
  /** One plain line under the column heading. */
  description: string;
  colorKey: AreaColorKey;
  /** Shown in an empty column. */
  emptyMessage: string;
};

/**
 * Left to right, the way the work actually flows: a student arrives needing
 * review, collects their documents, becomes ready, gets assigned. On Hold sits
 * at the end because it is a pause, not a stage.
 */
export const PLACEMENT_BOARD_COLUMNS: readonly BoardColumn[] = [
  {
    status: "needs_review",
    label: "Needs Review",
    description: "Nobody has been through their documents yet.",
    colorKey: "slate",
    emptyMessage: "Every student has been looked at.",
  },
  {
    status: "documents_pending",
    label: "Documents Pending",
    description: "Still waiting on part of the checklist.",
    colorKey: "amber",
    emptyMessage: "No student is waiting on documents.",
  },
  {
    status: "ready_for_placement",
    label: "Ready for Placement",
    description: "Documents are complete. These students need a partner.",
    colorKey: "green",
    emptyMessage: "No student is waiting for a placement.",
  },
  {
    status: "placement_assigned",
    label: "Placement Assigned",
    description: "Matched with a placement partner.",
    colorKey: "indigo",
    emptyMessage: "No placement has been assigned yet.",
  },
  {
    status: "placement_started",
    label: "On Placement",
    description: "At their partner right now. Finished, never cancelled.",
    colorKey: "teal",
    emptyMessage: "No students are currently on placement.",
  },
  {
    status: "on_hold",
    label: "On Hold",
    description: "Paused on purpose. Released by staff, never automatically.",
    colorKey: "coral",
    emptyMessage: "No student is on hold.",
  },
] as const;

export const BOARD_STATUSES: readonly PlacementStatus[] =
  PLACEMENT_BOARD_COLUMNS.map((column) => column.status);

/** True when a student belongs on one of the six working columns. */
export function isBoardStatus(status: PlacementStatus): boolean {
  return BOARD_STATUSES.includes(status);
}

/**
 * What dragging a card onto a column should actually do.
 *
 * Placement state is business logic, not a card position, so a drag may never
 * invent a state the database would not agree with. There are exactly three
 * honest outcomes, and NONE of them is a lifecycle transition:
 *
 *   hold      pause a student. A controlled action with an optional reason.
 *   release   take a student off hold, back to whatever the facts say.
 *   find      a Ready student dropped on Placement Assigned opens Find
 *             Placement. The move happens when a real partner is chosen, not
 *             when the card lands.
 *
 * Everything else is refused WITH A REASON rather than silently ignored, so
 * staff learn the rule instead of wondering why nothing happened.
 */
export type DropOutcome =
  | { kind: "hold" }
  | { kind: "release" }
  | { kind: "find" }
  | { kind: "none" }
  | { kind: "refused"; reason: string };

export function dropOutcome(
  from: PlacementStatus,
  to: PlacementStatus,
): DropOutcome {
  if (from === to) return { kind: "none" };

  if (to === "on_hold") return { kind: "hold" };
  if (from === "on_hold") return { kind: "release" };

  if (from === "ready_for_placement" && to === "placement_assigned") {
    return { kind: "find" };
  }

  // The three lifecycle moves, each refused with the action that actually does
  // it. None of them is a card position: starting a placement is a staff member
  // saying the student really began, and finishing one has a question attached
  // that only a staff member can answer.
  if (from === "placement_assigned" && to === "placement_started") {
    return {
      kind: "refused",
      reason:
        "Starting a placement is a deliberate action, not a drag. Use Start Placement on the card and record the day the student actually began. A placement never starts because its planned date arrived.",
    };
  }

  if (from === "placement_started") {
    return {
      kind: "refused",
      reason:
        "This student is on placement. Use Finish Placement, which records what happened at this partner and asks whether it completes their whole placement requirement. A student who was actually there is finished, never cancelled.",
    };
  }

  if (to === "placement_started") {
    return {
      kind: "refused",
      reason:
        "On Placement means a student who has actually started at a partner. Assign them a placement first, then use Start Placement.",
    };
  }

  if (from === "placement_assigned") {
    return {
      kind: "refused",
      reason:
        "This student already has a placement. On their placement page, cancel the assignment if it never started, or start it and finish it later. Either way, they come back to the column their documents put them in unless their requirement is complete.",
    };
  }

  if (to === "placement_assigned") {
    return {
      kind: "refused",
      reason:
        "Only a student who is Ready for Placement can be assigned to a partner. Finish their documents first.",
    };
  }

  return {
    kind: "refused",
    reason:
      "Needs Review, Documents Pending, and Ready for Placement come from the document checklist. Update the student's documents to move them.",
  };
}
