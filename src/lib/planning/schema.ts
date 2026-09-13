import { z } from "zod";

/**
 * Assigning, changing, or clearing one city's placement area.
 *
 * `city` is the readable label the screen is showing; the action normalizes it
 * to the match key. An empty `area_id` means Unmapped, which removes the row
 * rather than pointing it at a placeholder area.
 */
export const CityMappingSchema = z.object({
  city: z
    .string()
    .trim()
    .min(1, "A city is required.")
    .max(200, "City names are limited to 200 characters."),
  area_id: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : null)),
});

export type CityMappingValues = z.infer<typeof CityMappingSchema>;
