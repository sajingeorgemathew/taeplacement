/**
 * City normalization.
 *
 * The one deterministic answer to "are these two student cities the same
 * place". It is used by the Admin City to Area Mapping screen, by the mapping
 * server actions, and by Batch Planning, so a city typed three different ways
 * groups into one row everywhere.
 *
 * The rules are deliberately small and boring:
 *
 *   trim leading and trailing whitespace
 *   collapse repeated internal whitespace
 *   lowercase
 *
 * That is all. There is no geocoding, no maps service, no postal code lookup,
 * no alias table, and no spelling correction. "Scarborough" is not folded into
 * "Toronto" and "Missisauga" is not corrected to "Mississauga": both of those
 * are real data quality decisions that belong to a human, and guessing them
 * would silently plan a batch around the wrong area.
 *
 * A student's own city value is never rewritten by any of this. Normalization
 * only ever produces a MATCH KEY; the readable label shown on screen is the
 * spelling staff actually typed.
 */

/**
 * The readable form of a raw city value: whitespace tidied, nothing else.
 *
 * "  Mississauga  " becomes "Mississauga". "MISSISSAUGA" stays "MISSISSAUGA",
 * because re-casing someone's data is a rewrite, not a tidy.
 */
export function tidyCityName(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * The match key for a city.
 *
 * " Mississauga ", "MISSISSAUGA", and "mississauga" all return "mississauga".
 * A blank, whitespace only, or missing city returns "", which is the City
 * Missing case and is never treated as a city.
 */
export function normalizeCityName(value: string | null | undefined): string {
  return tidyCityName(value).toLowerCase();
}

/** True when the student actually has a city recorded. */
export function hasCityValue(value: string | null | undefined): boolean {
  return normalizeCityName(value).length > 0;
}

/**
 * The readable label for one group of raw spellings.
 *
 * The spelling staff used most often wins, so a group of eleven "Mississauga"
 * and one "MISSISSAUGA" is labelled "Mississauga". Ties are broken
 * alphabetically so the label is stable between page loads rather than
 * depending on row order.
 *
 * The label is only ever a display choice. It is stored on the mapping row as
 * city_name so Admin can read it later, and it is never written to a student.
 */
export function cityDisplayLabel(variants: Iterable<string | null | undefined>): string {
  const counts = new Map<string, number>();

  for (const raw of variants) {
    const label = tidyCityName(raw);
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  let best = "";
  let bestCount = 0;

  for (const [label, count] of [...counts].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }

  return best;
}
