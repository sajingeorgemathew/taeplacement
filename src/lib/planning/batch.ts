/**
 * Grouping one batch into planning areas.
 *
 * Pure functions over rows the page has already read. No database access, no
 * summary tables, and no stored aggregate: every number here is counted from
 * the live students, the live partners, and the live city mapping, so a status
 * change or a re-mapped city is reflected on the next page load with nothing to
 * rebuild.
 *
 * Two things this file deliberately does NOT do:
 *
 *   It never compares a student count to a partner count and calls the
 *   difference a shortage. Partner CAPACITY is not tracked anywhere in this
 *   application - one LTC may take six students and another may take one - so
 *   "5 ready, 2 available" is an observation and never "3 students cannot be
 *   placed".
 *
 *   It never guesses an area. A city with no mapping stays Unmapped and a
 *   student with no city stays City Missing, both of them visible.
 */

import type { PartnerListItem } from "@/lib/partners/queries";
import {
  PLACEMENT_STATUSES,
  type AvailabilityStatus,
  type PlacementStatus,
} from "@/lib/placement/constants";
import type { PlacementBoardStudent } from "@/lib/placement/queries";
import type { PlacementAreaRow } from "@/lib/supabase/database.types";

import {
  buildCityAreaIndex,
  resolveCityArea,
  type CityAreaIndex,
  type ResolvedCityArea,
} from "./mapping";

/** Counts for one set of students, by the existing placement statuses. */
export type PlanningStatusCounts = {
  total: number;
  byStatus: Record<PlacementStatus, number>;
};

/** One city inside an area card, or inside the Unmapped card. */
export type PlanningCityCount = {
  normalized: string;
  label: string;
  count: number;
  /**
   * Set only on the Unmapped card, when the city IS mapped but its area has
   * been archived. Those rows read as Needs Area Review and name the area, so
   * an admin knows which mapping to reassign.
   */
  archivedArea: PlacementAreaRow | null;
};

/** The partner picture for one area. Never a capacity or a slot count. */
export type PlanningPartnerSummary = {
  /** Active, non-archived partners whose area_id is this area. */
  total: number;
  availableNow: number;
  upcoming: number;
  unknown: number;
  notAvailable: number;
  /** Partners whose next_follow_up_at is today or already past. */
  followUpDue: number;
};

export type PlanningAreaGroup = {
  area: PlacementAreaRow;
  students: PlacementBoardStudent[];
  counts: PlanningStatusCounts;
  cities: PlanningCityCount[];
  partners: PlanningPartnerSummary;
};

/** Unmapped City and City Missing. Planning exceptions, not areas. */
export type PlanningExceptionGroup = {
  students: PlacementBoardStudent[];
  counts: PlanningStatusCounts;
  /** Empty for City Missing: those students have no city to list. */
  cities: PlanningCityCount[];
};

export type BatchPlanning = {
  /** Every active student in the selected batch. */
  students: PlacementBoardStudent[];
  counts: PlanningStatusCounts;
  areas: PlanningAreaGroup[];
  /** Non-empty city, no usable ACTIVE area. Includes Needs Area Review. */
  unmapped: PlanningExceptionGroup;
  /** Null or blank city. Kept separate from Unmapped on purpose. */
  missing: PlanningExceptionGroup;
  /** The mapping index this grouping was built from, for the drill-down. */
  cityIndex: CityAreaIndex;
};

function emptyCounts(): PlanningStatusCounts {
  const byStatus = {} as Record<PlacementStatus, number>;
  for (const status of PLACEMENT_STATUSES) byStatus[status] = 0;
  return { total: 0, byStatus };
}

/** Counts for any set of students. Used for the batch, an area, and a filter. */
export function countStudents(
  students: PlacementBoardStudent[],
): PlanningStatusCounts {
  const counts = emptyCounts();
  for (const student of students) {
    counts.total += 1;
    counts.byStatus[student.placement_status] += 1;
  }
  return counts;
}

/**
 * True when a partner's follow-up date has arrived or gone by.
 *
 * next_follow_up_at is stored as a timestamptz at UTC midnight and read as a
 * plain day everywhere else, so the comparison is day to day rather than moment
 * to moment: a follow-up set for today is Due all day, not from midnight UTC.
 */
export function isFollowUpDue(
  value: string | null | undefined,
  today: Date = new Date(),
): boolean {
  if (!value) return false;
  const due = value.slice(0, 10);
  if (due.length !== 10) return false;

  const now = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return due <= now;
}

const AVAILABILITY_FIELDS: Record<
  AvailabilityStatus,
  keyof Omit<PlanningPartnerSummary, "total" | "followUpDue">
> = {
  available_now: "availableNow",
  upcoming: "upcoming",
  unknown: "unknown",
  not_available: "notAvailable",
};

/** The availability picture for a set of partners. */
export function summarizePartners(
  partners: PartnerListItem[],
  today: Date = new Date(),
): PlanningPartnerSummary {
  const summary: PlanningPartnerSummary = {
    total: 0,
    availableNow: 0,
    upcoming: 0,
    unknown: 0,
    notAvailable: 0,
    followUpDue: 0,
  };

  for (const partner of partners) {
    summary.total += 1;
    summary[AVAILABILITY_FIELDS[partner.availability_status]] += 1;
    if (isFollowUpDue(partner.next_follow_up_at, today)) {
      summary.followUpDue += 1;
    }
  }

  return summary;
}

/** Active partners grouped by the area they are assigned to. */
export function groupPartnersByArea(
  partners: PartnerListItem[],
): Map<string, PartnerListItem[]> {
  const byArea = new Map<string, PartnerListItem[]>();
  for (const partner of partners) {
    if (!partner.area_id) continue;
    const list = byArea.get(partner.area_id) ?? [];
    list.push(partner);
    byArea.set(partner.area_id, list);
  }
  return byArea;
}

/** City counts for a set of students, largest first. */
function cityCounts(
  entries: { resolved: ResolvedCityArea }[],
  archivedAreas: boolean,
): PlanningCityCount[] {
  const cities = new Map<string, PlanningCityCount>();

  for (const { resolved } of entries) {
    if (resolved.state === "missing") continue;

    const existing = cities.get(resolved.normalized);
    if (existing) {
      existing.count += 1;
      continue;
    }

    cities.set(resolved.normalized, {
      normalized: resolved.normalized,
      label: resolved.label,
      count: 1,
      archivedArea:
        archivedAreas && resolved.state === "needs_review"
          ? resolved.area
          : null,
    });
  }

  return [...cities.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}

/**
 * Group one batch's students into planning areas.
 *
 * Only ACTIVE areas become cards, and only areas that actually hold a student
 * from this batch: an area with nobody in it is not a planning question for
 * this batch, and showing an empty card for every configured area would bury
 * the ones that matter.
 *
 * Students whose city maps to an ARCHIVED area are not placed in that area's
 * card. They land in Unmapped as Needs Area Review, carrying the archived
 * area's name, so archiving an area can never quietly hide a student or send
 * planning to retired partners.
 */
export function buildBatchPlanning(input: {
  students: PlacementBoardStudent[];
  partners: PartnerListItem[];
  areas: PlacementAreaRow[];
  mappings: Parameters<typeof buildCityAreaIndex>[0];
  today?: Date;
}): BatchPlanning {
  const today = input.today ?? new Date();
  const cityIndex = buildCityAreaIndex(input.mappings, input.areas);
  const partnersByArea = groupPartnersByArea(input.partners);

  type Entry = { student: PlacementBoardStudent; resolved: ResolvedCityArea };

  const byArea = new Map<string, Entry[]>();
  const unmapped: Entry[] = [];
  const missing: Entry[] = [];

  for (const student of input.students) {
    const resolved = resolveCityArea(student.city, cityIndex);
    const entry = { student, resolved };

    if (resolved.state === "mapped") {
      const list = byArea.get(resolved.area.id) ?? [];
      list.push(entry);
      byArea.set(resolved.area.id, list);
      continue;
    }
    if (resolved.state === "missing") {
      missing.push(entry);
      continue;
    }
    unmapped.push(entry);
  }

  const areas: PlanningAreaGroup[] = input.areas
    .filter((area) => area.is_active && (byArea.get(area.id)?.length ?? 0) > 0)
    .map((area) => {
      const entries = byArea.get(area.id) ?? [];
      const students = entries.map((entry) => entry.student);
      return {
        area,
        students,
        counts: countStudents(students),
        cities: cityCounts(entries, false),
        partners: summarizePartners(partnersByArea.get(area.id) ?? [], today),
      };
    });

  return {
    students: input.students,
    counts: countStudents(input.students),
    areas,
    unmapped: {
      students: unmapped.map((entry) => entry.student),
      counts: countStudents(unmapped.map((entry) => entry.student)),
      cities: cityCounts(unmapped, true),
    },
    missing: {
      students: missing.map((entry) => entry.student),
      counts: countStudents(missing.map((entry) => entry.student)),
      cities: [],
    },
    cityIndex,
  };
}

/**
 * The neutral planning observation for one area.
 *
 * Two plain sentences describing what is on the screen. It never subtracts one
 * count from the other, because a partner is not a seat.
 */
export function planningObservation(group: PlanningAreaGroup): string | null {
  const ready = group.counts.byStatus.ready_for_placement;
  if (ready === 0 && group.partners.total === 0) return null;

  const students =
    ready === 1
      ? "1 student is ready in this Area."
      : `${ready} students are ready in this Area.`;

  if (group.partners.total === 0) {
    return `${students} No placement partners are assigned to this Area yet.`;
  }

  const available =
    group.partners.availableNow === 0
      ? "No partner here is currently marked Available Now."
      : group.partners.availableNow === 1
        ? "1 partner is currently marked Available Now."
        : `${group.partners.availableNow} partners are currently marked Available Now.`;

  if (group.partners.unknown === 0) return `${students} ${available}`;

  const unknown =
    group.partners.unknown === 1
      ? "1 partner has not been checked yet."
      : `${group.partners.unknown} partners have not been checked yet.`;

  return `${students} ${available} ${unknown}`;
}
