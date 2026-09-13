/**
 * Credited placement hours.
 *
 * This is the whole of the hours model, and it is deliberately tiny.
 * `credited_hours` is ONE number per placement segment: the final total staff
 * accept for that placement. There is no timesheet, no attendance, no check-in,
 * and no hour-entry log behind it - those are PLACEMENT-05.
 *
 * A student who did 120 hours at one partner and 180 at another has 300
 * credited hours, and adding the two together is all this file does.
 */

import {
  countsTowardCreditedHours,
  type PlacementRecordStatus,
} from "@/lib/placement/constants";

/** Just enough of a placement row to count it. */
export type CreditedPlacement = {
  status: PlacementRecordStatus;
  credited_hours: number | null;
};

/**
 * Total credited hours across a student's placements, cancelled ones excluded.
 *
 * Returns null when nobody has credited any hours yet. That is a different fact
 * from zero hours, and the interface says so differently.
 */
export function totalCreditedHours(
  placements: readonly CreditedPlacement[],
): number | null {
  let total = 0;
  let credited = false;

  for (const placement of placements) {
    if (!countsTowardCreditedHours(placement.status)) continue;
    if (placement.credited_hours === null) continue;
    total += Number(placement.credited_hours);
    credited = true;
  }

  return credited ? total : null;
}

/**
 * "120 hours", "7.5 hours", "1 hour".
 *
 * Postgres numeric arrives as a string or a number depending on the driver, so
 * it is normalised here rather than trusted, and a whole number never renders
 * as "120.00".
 */
export function formatCreditedHours(
  value: number | string | null | undefined,
): string | null {
  if (value === null || value === undefined || value === "") return null;

  const hours = Number(value);
  if (!Number.isFinite(hours)) return null;

  const shown = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${shown} ${hours === 1 ? "hour" : "hours"}`;
}
