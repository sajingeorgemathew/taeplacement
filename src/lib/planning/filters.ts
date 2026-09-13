/**
 * Batch Planning state, carried entirely in the URL.
 *
 *   batch         the selected batch id
 *   area          an area id, which opens the Area drill-down
 *   exception     unmapped or missing, which opens that exception's students
 *   status        a student filter inside a drill-down
 *   availability  a partner filter inside an Area drill-down
 *
 * Nothing lives in client state, so a planner can send a colleague the exact
 * view they are looking at, and a reload lands in the same place. This mirrors
 * the Placement toolbar and Find Placement, which already work this way.
 */

import {
  isAvailabilityStatus,
  isPlacementStatus,
} from "@/lib/placement/constants";
import type { BatchRow } from "@/lib/supabase/database.types";

import { isPlanningException, type PlanningException } from "./constants";

export type PlanningValues = {
  batch: string;
  area: string;
  exception: string;
  status: string;
  availability: string;
};

export const emptyPlanningValues: PlanningValues = {
  batch: "",
  area: "",
  exception: "",
  status: "",
  availability: "",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function planningValuesFrom(params: RawSearchParams): PlanningValues {
  return {
    batch: single(params.batch),
    area: single(params.area),
    exception: single(params.exception),
    status: single(params.status),
    availability: single(params.availability),
  };
}

export function planningHref(
  basePath: string,
  values: PlanningValues,
  change: Partial<PlanningValues>,
): string {
  const next = { ...values, ...change };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Only a real placement status filters anything. Anything else means All. */
export function planningStudentStatus(values: PlanningValues) {
  return isPlacementStatus(values.status) ? values.status : null;
}

/** Only a real availability status filters anything. */
export function planningAvailability(values: PlanningValues) {
  return isAvailabilityStatus(values.availability)
    ? values.availability
    : null;
}

export function planningException(
  values: PlanningValues,
): PlanningException | null {
  return isPlanningException(values.exception) ? values.exception : null;
}

/**
 * The batch to plan.
 *
 * The URL wins when it names a batch that still exists. Otherwise the default
 * is the most recent ACTIVE batch, read from the batch records themselves: the
 * latest start_date, and where dates are missing the last batch in the admin
 * display order. Batch names are never hard-coded and never parsed, so an
 * academy that stops running "April / June / August" needs no code change.
 *
 * Falls back to the most recent batch of any status when every batch has been
 * archived, so the page still has something to show rather than going blank.
 */
export function resolveBatch(
  values: PlanningValues,
  batches: BatchRow[],
): BatchRow | null {
  if (batches.length === 0) return null;

  const chosen = batches.find((batch) => batch.id === values.batch);
  if (chosen) return chosen;

  const active = batches.filter((batch) => batch.status === "active");
  return mostRecent(active.length > 0 ? active : batches);
}

function mostRecent(batches: BatchRow[]): BatchRow | null {
  if (batches.length === 0) return null;

  const dated = batches.filter((batch) => batch.start_date);
  if (dated.length > 0) {
    return dated.reduce((latest, batch) =>
      (batch.start_date ?? "") > (latest.start_date ?? "") ? batch : latest,
    );
  }

  // No start dates recorded anywhere: listBatches() already returns admin
  // display order, so the last one is the newest intake staff set up.
  return batches[batches.length - 1];
}
