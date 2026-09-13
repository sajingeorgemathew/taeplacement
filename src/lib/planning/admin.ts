/**
 * The rows behind /admin/city-area-mapping.
 *
 * Pure. It joins three things the page has already read - the cities active
 * students actually live in, the mapping rows, and the area definitions - into
 * one list an admin can work down.
 *
 * The list is driven by the ROSTER, not by a master list of Canadian cities.
 * Nobody has to type out Ontario before planning a batch: the screen shows the
 * cities that are really on student records right now, grouped so that
 * " Mississauga ", "MISSISSAUGA", and "mississauga" are one row with one Area
 * choice.
 *
 * A mapping whose city no longer appears on any active student is NOT deleted
 * and NOT hidden. It keeps its own quiet section, so an admin can see it,
 * reassign it, or remove it deliberately. Mapping data is never cleaned up
 * behind their back.
 */

import type {
  PlacementAreaCityRow,
  PlacementAreaRow,
} from "@/lib/supabase/database.types";

import { buildCityAreaIndex, type CityAreaState } from "./mapping";
import type { StudentCityUsage } from "./queries";

export type CityMappingRow = {
  normalized: string;
  /** The readable spelling. From the roster where there is one, else the row. */
  label: string;
  /** Other spellings on student records, shown as "also spelled". */
  variants: string[];
  studentCount: number;
  mapping: PlacementAreaCityRow | null;
  /** The area the mapping points at, active or archived. */
  area: PlacementAreaRow | null;
  /** mapped, needs_review (archived area), or unmapped. Never missing. */
  state: Exclude<CityAreaState, "missing">;
};

export type CityMappingBoard = {
  /** Cities active students live in. Problems sort to the top. */
  rows: CityMappingRow[];
  /** Mappings no active student currently uses. Kept, never auto-removed. */
  unused: CityMappingRow[];
  counts: {
    cities: number;
    mapped: number;
    unmapped: number;
    needsReview: number;
    unused: number;
  };
};

/** Needs Area Review first, then Unmapped, then mapped. Busiest city first. */
const STATE_ORDER: Record<CityMappingRow["state"], number> = {
  needs_review: 0,
  unmapped: 1,
  mapped: 2,
};

function compareRows(a: CityMappingRow, b: CityMappingRow): number {
  return (
    STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
    b.studentCount - a.studentCount ||
    a.label.localeCompare(b.label)
  );
}

export function buildCityMappingBoard(input: {
  usage: StudentCityUsage[];
  mappings: PlacementAreaCityRow[];
  areas: PlacementAreaRow[];
}): CityMappingBoard {
  const index = buildCityAreaIndex(input.mappings, input.areas);
  const seen = new Set<string>();

  const rows: CityMappingRow[] = input.usage.map((city) => {
    seen.add(city.normalized);
    const entry = index.get(city.normalized);
    const area = entry?.area ?? null;

    return {
      normalized: city.normalized,
      label: city.label,
      variants: city.variants,
      studentCount: city.studentCount,
      mapping: entry?.mapping ?? null,
      area,
      state: !area ? "unmapped" : area.is_active ? "mapped" : "needs_review",
    };
  });

  // Mappings the roster no longer uses. They stay visible and editable: a
  // student may move back, and a mapping is an admin decision to undo, not a
  // stale record to garbage collect.
  const unused: CityMappingRow[] = [];
  for (const [normalized, entry] of index) {
    if (seen.has(normalized)) continue;
    unused.push({
      normalized,
      label: entry.mapping.city_name,
      variants: [],
      studentCount: 0,
      mapping: entry.mapping,
      area: entry.area,
      state: !entry.area
        ? "unmapped"
        : entry.area.is_active
          ? "mapped"
          : "needs_review",
    });
  }

  rows.sort(compareRows);
  unused.sort(compareRows);

  const all = [...rows, ...unused];

  return {
    rows,
    unused,
    counts: {
      cities: rows.length,
      mapped: rows.filter((row) => row.state === "mapped").length,
      unmapped: rows.filter((row) => row.state === "unmapped").length,
      needsReview: all.filter((row) => row.state === "needs_review").length,
      unused: unused.length,
    },
  };
}
