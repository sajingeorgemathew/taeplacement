/**
 * Batch Planning state, carried entirely in the URL.
 *
 *   batch         the selected batch id
 *   area          an area id, which opens the Area drill-down
 *   exception     unmapped or missing, which opens that exception's students
 *   status        a student filter inside a drill-down, or on its own the
 *                 batch-wide drill-down for one placement status
 *   availability  a partner filter inside an Area drill-down
 *   city          a normalized city, which opens the students from that city
 *                 (PLACEMENT-07B)
 *   need          "action" or "review", which opens the students with a
 *                 document need of that kind (PLACEMENT-07B)
 *   requirement   a requirement id narrowing a need drill-down to one
 *                 requirement (PLACEMENT-07B)
 *   operations    "all" widens the batch selector to every batch; absent, the
 *                 selector offers only batches in current placement operations
 *
 * Nothing lives in client state, so a planner can send a colleague the exact
 * view they are looking at, and a reload lands in the same place. This mirrors
 * the Placement toolbar and Find Placement, which already work this way.
 */

import {
  isAvailabilityStatus,
  isPlacementStatus,
} from "@/lib/placement/constants";
import {
  batchChoicesForScope,
  operationalBatches,
  operationsScopeFrom,
  type OperationsScope,
} from "@/lib/placement/operations";
import type { BatchRow } from "@/lib/supabase/database.types";

import { normalizeCityName } from "./city";
import { isPlanningException, type PlanningException } from "./constants";
import { isNeedKind, type NeedKind } from "./needs";

export type PlanningValues = {
  batch: string;
  area: string;
  exception: string;
  status: string;
  availability: string;
  city: string;
  need: string;
  requirement: string;
  operations: string;
};

export const emptyPlanningValues: PlanningValues = {
  batch: "",
  area: "",
  exception: "",
  status: "",
  availability: "",
  city: "",
  need: "",
  requirement: "",
  operations: "",
};

/**
 * The keys that describe WHERE inside a batch the page is looking. Changing
 * one drill-down resets the others, so a city link never carries an old Area
 * or a stale status filter along with it. The batch and the scope are kept.
 */
export const PLANNING_DRILLDOWN_KEYS = [
  "area",
  "exception",
  "status",
  "availability",
  "city",
  "need",
  "requirement",
] as const satisfies readonly (keyof PlanningValues)[];

export const clearedDrilldown: Pick<
  PlanningValues,
  (typeof PLANNING_DRILLDOWN_KEYS)[number]
> = {
  area: "",
  exception: "",
  status: "",
  availability: "",
  city: "",
  need: "",
  requirement: "",
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
    city: single(params.city),
    need: single(params.need),
    requirement: single(params.requirement),
    operations: single(params.operations),
  };
}

/** A drill-down link: the batch and scope kept, every drill-down key reset. */
export function planningDrilldownHref(
  basePath: string,
  values: PlanningValues,
  change: Partial<PlanningValues>,
): string {
  return planningHref(basePath, values, { ...clearedDrilldown, ...change });
}

/** Longer than any real city. Anything past this is not a city, it is noise. */
const MAX_CITY_KEY_LENGTH = 120;

/**
 * The city a drill-down is about, as the same normalized match key the
 * mapping uses, so "?city=Mississauga" and "?city=mississauga" open the same
 * students. Blank, missing, or absurdly long values open nothing.
 *
 * The City Missing row is not reached this way: it is exception=missing, the
 * PLACEMENT-05A view, because a student with no city has no key to match.
 */
export function planningCity(values: PlanningValues): string | null {
  const key = normalizeCityName(values.city);
  if (!key || key.length > MAX_CITY_KEY_LENGTH) return null;
  return key;
}

/** Only "action" or "review" opens a need drill-down. */
export function planningNeed(values: PlanningValues): NeedKind | null {
  return isNeedKind(values.need) ? values.need : null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The requirement narrowing a need drill-down. Only a well-formed id is
 * accepted; whether the batch actually has that requirement is decided by the
 * page against the requirements it read. Anything else means every
 * requirement of that kind.
 */
export function planningRequirement(values: PlanningValues): string | null {
  const value = values.requirement.trim();
  return UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

/**
 * Which view the URL opens. One resolver, in priority order, so the page and
 * the checks agree on what a combination of parameters means:
 *
 *   exception   Unmapped City / City Missing students
 *   area        one Placement Area, students and partners
 *   city        the students from one city
 *   need        the students with a document need
 *   status      every student in the batch with one placement status
 *   overview    the batch summary
 */
export type PlanningView =
  | "exception"
  | "area"
  | "city"
  | "need"
  | "status"
  | "overview";

export function planningView(values: PlanningValues): PlanningView {
  if (planningException(values)) return "exception";
  if (values.area) return "area";
  if (planningCity(values)) return "city";
  if (planningNeed(values)) return "need";
  if (planningStudentStatus(values)) return "status";
  return "overview";
}

/**
 * The batch selector's scope: current placement operations unless staff
 * explicitly asked for every batch (operations=all). Resolved by the same
 * helper as the Students and Placement pages.
 */
export function planningScopeFrom(values: PlanningValues): OperationsScope {
  return operationsScopeFrom(values.operations);
}

/**
 * The batches the selector offers.
 *
 * By default only batches in current placement operations (active AND
 * tracked), which is what staff are actually planning. Whatever batch the URL
 * already names is always included, so a historical link keeps working and
 * the select can show it. Show all batches lists every batch.
 */
export function planningBatchChoices(
  values: PlanningValues,
  batches: readonly BatchRow[],
  selectedId: string | null = values.batch || null,
): BatchRow[] {
  return batchChoicesForScope(batches, planningScopeFrom(values), selectedId);
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
 * The URL wins when it names a batch that still exists, whatever its status
 * or tracking flag: a direct link to an old batch is historical access and it
 * must keep working. Otherwise the default is the most recent batch in CURRENT
 * placement operations (active and tracked), read from the batch records
 * themselves: the latest start_date, and where dates are missing the last
 * batch in the admin display order. Batch names are never hard-coded and never
 * parsed, so an academy that stops running "April / June / August" needs no
 * code change.
 *
 * Falls back to the most recent active batch when nothing is tracked yet, and
 * to the most recent batch of any status when every batch has been archived,
 * so the page still has something to show rather than going blank.
 */
export function resolveBatch(
  values: PlanningValues,
  batches: BatchRow[],
): BatchRow | null {
  if (batches.length === 0) return null;

  const chosen = batches.find((batch) => batch.id === values.batch);
  if (chosen) return chosen;

  const operational = operationalBatches(batches);
  if (operational.length > 0) return mostRecent(operational);

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
