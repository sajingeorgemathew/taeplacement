"use server";

import { revalidatePath } from "next/cache";

import { isAdmin, requireActiveStaff } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { normalizeCityName, tidyCityName } from "./city";
import { CityMappingSchema } from "./schema";

export type CityMappingResult = { error: string | null };

const OK: CityMappingResult = { error: null };

const ADMIN_ONLY =
  "Only an admin can change city to area mapping. Ask an admin to make this change.";

function revalidateMapping() {
  revalidatePath("/admin/city-area-mapping");
  revalidatePath("/placement/planning");
}

/**
 * Map one city to a placement area, move it to a different area, or return it
 * to Unmapped.
 *
 * Three things this never does:
 *
 *   It never touches a student record. Student city is the factual address
 *   value and it is corrected on the student, not here.
 *
 *   It never creates a placeholder area. Unmapped is the absence of a row, so
 *   clearing a city DELETES its mapping row instead of parking it somewhere.
 *
 *   It never maps a city to an ARCHIVED area. Archived areas are off the board,
 *   so offering one would create a Needs Area Review row on purpose.
 */
export async function setCityAreaAction(input: {
  city: string;
  areaId: string | null;
}): Promise<CityMappingResult> {
  const session = await requireActiveStaff();
  if (!isAdmin(session)) return { error: ADMIN_ONLY };

  const parsed = CityMappingSchema.safeParse({
    city: input.city,
    area_id: input.areaId ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "That city is not valid." };
  }

  const normalized = normalizeCityName(parsed.data.city);
  if (!normalized) return { error: "That city is not valid." };

  const supabase = await createSupabaseServerClient();

  // Unmapped: remove the row. The city keeps appearing on the mapping screen
  // because active students still live there; it simply has no area again.
  if (!parsed.data.area_id) {
    const { error } = await supabase
      .from("placement_area_cities")
      .delete()
      .eq("normalized_city_name", normalized);

    if (error) {
      return { error: "That mapping could not be removed. Try again." };
    }

    revalidateMapping();
    return OK;
  }

  const { data: area, error: areaError } = await supabase
    .from("placement_areas")
    .select("id, is_active")
    .eq("id", parsed.data.area_id)
    .maybeSingle();

  if (areaError) return { error: "The area could not be read. Try again." };
  if (!area) return { error: "That placement area no longer exists." };
  if (!area.is_active) {
    return {
      error:
        "That placement area has been archived. Reactivate it in Placement Areas, or choose an active area.",
    };
  }

  const { error } = await supabase.from("placement_area_cities").upsert(
    {
      area_id: area.id,
      city_name: tidyCityName(parsed.data.city),
      normalized_city_name: normalized,
    },
    { onConflict: "normalized_city_name" },
  );

  if (error) {
    return { error: "That mapping could not be saved. Try again." };
  }

  revalidateMapping();
  return OK;
}
