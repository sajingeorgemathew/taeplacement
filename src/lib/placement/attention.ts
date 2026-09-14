/**
 * The computed attention states on an active placement.
 *
 * Every label here is worked out from dates the placement already has, at the
 * moment the page is rendered. NONE of them is a status, a column, or a
 * database field, and nothing in this file ever changes a placement:
 *
 *   Starting Today          planned_start_date is today, still assigned
 *   Start Date Passed       planned_start_date has gone by, still assigned
 *   Ends Today              planned_end_date is today, still started
 *   Ending Soon             planned_end_date is within the next week
 *   Planned End Date Passed planned_end_date has gone by, still started
 *
 * "Start Date Passed" in particular is an OBSERVATION, not an instruction and
 * certainly not a trigger. A placement is started by a staff member saying the
 * student actually began, because the planned date arriving is not evidence
 * that they did.
 *
 * Dates here are the plain "YYYY-MM-DD" strings the DATE columns hold, so they
 * compare as strings and are never widened into a timestamp: a placement
 * planned to start on the 27th must not read as the evening of the 26th
 * somewhere else in the world.
 */

import type { Tone } from "@/lib/placement/constants";

export type PlacementAttentionKey =
  | "starting_today"
  | "start_date_passed"
  | "ends_today"
  | "ending_soon"
  | "planned_end_passed";

export type PlacementAttention = {
  key: PlacementAttentionKey;
  label: string;
  /** One plain sentence, for the places that have room to explain. */
  description: string;
  tone: Tone;
};

/** Just enough of a placement row to read its dates. */
export type DatedPlacement = {
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date?: string | null;
};

/** How far ahead a planned end still counts as Ending Soon. */
export const ENDING_SOON_DAYS = 7;

const MS_PER_DAY = 86_400_000;

/**
 * Today as "YYYY-MM-DD" in the reader's own day.
 *
 * Pages compute this ONCE on the server and pass it down, so a card rendered on
 * the server and hydrated in the browser can never disagree about what day it
 * is, and so a whole board reads every date against the same today.
 */
export function todayKey(now: Date = new Date()): string {
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** A stored DATE value as the plain day it is, or null. */
function dayOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** Whole days from `from` to `to`, both plain days. Negative when `to` is past. */
export function daysBetween(from: string, to: string): number | null {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / MS_PER_DAY);
}

/** "in 3 days", "tomorrow". Only ever used for a date still ahead of us. */
function inDaysLabel(days: number): string {
  if (days === 1) return "Ends tomorrow";
  return `Ends in ${days} days`;
}

/**
 * The attention state of an ASSIGNED placement, or null when there is nothing
 * to say.
 *
 * A placement with no planned start date is not late and is not starting today.
 * It is simply a placement nobody has put a date on, which is a legitimate way
 * to record a real assignment and never an alert.
 */
export function assignedAttention(
  placement: DatedPlacement,
  today: string,
): PlacementAttention | null {
  const plannedStart = dayOf(placement.planned_start_date);
  if (!plannedStart) return null;

  if (plannedStart === today) {
    return {
      key: "starting_today",
      label: "Starting Today",
      description:
        "This placement is planned to start today. Start it once the student has actually begun.",
      tone: "info",
    };
  }

  if (plannedStart < today) {
    return {
      key: "start_date_passed",
      label: "Start Date Passed",
      description:
        "The planned start date has gone by and this placement is still waiting to start. Nothing starts on its own.",
      tone: "warning",
    };
  }

  return null;
}

/**
 * The attention state of a STARTED placement, or null.
 *
 * Ending Soon is deliberately the quietest of the three. A placement ending
 * next week is normal; one that should have ended already is the line worth
 * seeing across a board.
 */
export function startedAttention(
  placement: DatedPlacement,
  today: string,
): PlacementAttention | null {
  const plannedEnd = dayOf(placement.planned_end_date);
  if (!plannedEnd) return null;

  if (plannedEnd === today) {
    return {
      key: "ends_today",
      label: "Ends Today",
      description: "This placement is planned to end today.",
      tone: "warning",
    };
  }

  if (plannedEnd < today) {
    return {
      key: "planned_end_passed",
      label: "Planned End Date Passed",
      description:
        "The planned end date has gone by and this placement is still running. Finish it when you know what happened.",
      tone: "attention",
    };
  }

  const days = daysBetween(today, plannedEnd);
  if (days !== null && days <= ENDING_SOON_DAYS) {
    return {
      key: "ending_soon",
      label: inDaysLabel(days),
      description: "This placement is planned to end within the week.",
      tone: "neutral",
    };
  }

  return null;
}

/**
 * The attention state for whichever of the two ACTIVE statuses a placement is
 * in. Finished placements never have one: they are history, not work.
 */
export function placementAttention(
  placement: DatedPlacement & { status: string },
  today: string,
): PlacementAttention | null {
  if (placement.status === "assigned") {
    return assignedAttention(placement, today);
  }
  if (placement.status === "started") {
    return startedAttention(placement, today);
  }
  return null;
}
