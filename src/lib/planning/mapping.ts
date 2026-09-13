/**
 * Turning a student's city into a placement area.
 *
 * Pure functions over rows that have already been read. Nothing here touches
 * the database, so the same resolution runs on the Admin mapping screen, on the
 * Batch Planning overview, and inside an Area drill-down without three
 * different definitions of "which area is this student in".
 *
 * There are exactly four answers, and the last three are all planning facts
 * staff need to see rather than problems to hide:
 *
 *   mapped        the normalized city points at an ACTIVE area
 *   needs_review  it points at an area that has been ARCHIVED
 *   unmapped      the student has a city, but no mapping row matches it
 *   missing       the student has no city on file at all
 *
 * needs_review is never silently treated as a valid area, and it is never
 * cleared automatically: archiving an area must not quietly move a batch's
 * students somewhere else, and it must not make them disappear either. For
 * ordinary planning they group with Unmapped, carrying the archived area's name
 * so an admin knows exactly which mapping to reassign.
 */

import type {
  PlacementAreaCityRow,
  PlacementAreaRow,
} from "@/lib/supabase/database.types";

import { normalizeCityName, tidyCityName } from "./city";

export type CityAreaState = "mapped" | "needs_review" | "unmapped" | "missing";

/** One mapping row with the area it points at already resolved. */
export type CityAreaEntry = {
  mapping: PlacementAreaCityRow;
  /** Null only when the area row could not be read at all. */
  area: PlacementAreaRow | null;
};

export type CityAreaIndex = Map<string, CityAreaEntry>;

export type ResolvedCityArea =
  | { state: "missing"; normalized: ""; label: null; area: null }
  | { state: "unmapped"; normalized: string; label: string; area: null }
  | {
      state: "needs_review";
      normalized: string;
      label: string;
      /** The ARCHIVED area the mapping still points at. Never used as valid. */
      area: PlacementAreaRow;
    }
  | {
      state: "mapped";
      normalized: string;
      label: string;
      area: PlacementAreaRow;
    };

/** Mapping rows keyed by their normalized city, with the area attached. */
export function buildCityAreaIndex(
  mappings: PlacementAreaCityRow[],
  areas: PlacementAreaRow[],
): CityAreaIndex {
  const areasById = new Map(areas.map((area) => [area.id, area]));
  const index: CityAreaIndex = new Map();

  for (const mapping of mappings) {
    index.set(mapping.normalized_city_name, {
      mapping,
      area: areasById.get(mapping.area_id) ?? null,
    });
  }

  return index;
}

/**
 * The area for one city value.
 *
 * `label` is the student's own spelling, tidied for display only. The area is
 * never guessed: a city with no matching row is unmapped, full stop.
 */
export function resolveCityArea(
  city: string | null | undefined,
  index: CityAreaIndex,
): ResolvedCityArea {
  const normalized = normalizeCityName(city);
  if (!normalized) {
    return { state: "missing", normalized: "", label: null, area: null };
  }

  const label = tidyCityName(city);
  const entry = index.get(normalized);

  if (!entry?.area) {
    return { state: "unmapped", normalized, label, area: null };
  }
  if (!entry.area.is_active) {
    return { state: "needs_review", normalized, label, area: entry.area };
  }
  return { state: "mapped", normalized, label, area: entry.area };
}

/**
 * True when a resolution counts as Unmapped City for planning.
 *
 * An archived area is included on purpose. Those students still have to be
 * planned for, and pretending their mapping still works would send staff to a
 * set of partners the academy has already retired from the board.
 */
export function countsAsUnmapped(resolved: ResolvedCityArea): boolean {
  return resolved.state === "unmapped" || resolved.state === "needs_review";
}
