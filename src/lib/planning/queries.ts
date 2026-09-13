/**
 * Reads for Batch Planning and the Admin City to Area Mapping screen.
 *
 * Everything a planning page needs already exists somewhere else, so almost
 * nothing is re-queried here:
 *
 *   students        listPlacementStudents() - PLACEMENT-04, already carries
 *                   document readiness and the live placement
 *   partners        listPartners() - PLACEMENT-03, already carries the area,
 *                   availability, and contact counts
 *   readiness       student_document_readiness, through the queries above.
 *                   The 13-document rules are never re-implemented.
 *
 * What is genuinely new is only the city mapping table and the list of cities
 * the roster actually uses.
 */

import { requireActiveStaff } from "@/lib/auth/session";
import type { PlacementAreaCityRow } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { cityDisplayLabel, normalizeCityName, tidyCityName } from "./city";

/** Every city to area mapping, readable label first. */
export async function listCityAreaMappings(): Promise<PlacementAreaCityRow[]> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("placement_area_cities")
    .select("*")
    .order("normalized_city_name", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** One distinct city the roster actually uses, with its raw spellings. */
export type StudentCityUsage = {
  /** The match key. */
  normalized: string;
  /** The readable spelling staff use most often. */
  label: string;
  /** Every distinct raw spelling in the roster, tidied, for "also spelled". */
  variants: string[];
  /** Active students whose city normalizes to this key. */
  studentCount: number;
};

/**
 * The distinct cities of ACTIVE students, grouped by normalized value.
 *
 * This is what drives the Admin mapping screen: the list comes from the roster
 * itself, so nobody has to build and maintain a master list of Canadian cities,
 * and a city stops appearing when no active student lives there any more.
 *
 * Students with no city are simply absent from this list. They are City
 * Missing, which is a student record problem, not a mapping problem, and it is
 * surfaced in Batch Planning instead.
 */
export async function listStudentCityUsage(): Promise<StudentCityUsage[]> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("students")
    .select("city")
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const groups = new Map<string, { raw: string[]; count: number }>();

  for (const row of data ?? []) {
    const normalized = normalizeCityName(row.city);
    if (!normalized) continue;

    const group = groups.get(normalized) ?? { raw: [], count: 0 };
    group.raw.push(row.city ?? "");
    group.count += 1;
    groups.set(normalized, group);
  }

  return [...groups.entries()]
    .map(([normalized, group]) => ({
      normalized,
      label: cityDisplayLabel(group.raw),
      // Tidied the same way the label is, so " New  York" and "New York" are
      // one variant rather than two spellings of the same typing accident.
      variants: [...new Set(group.raw.map(tidyCityName))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
      studentCount: group.count,
    }))
    .sort(
      (a, b) =>
        b.studentCount - a.studentCount || a.label.localeCompare(b.label),
    );
}
