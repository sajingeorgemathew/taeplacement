/**
 * Conservative address parsing.
 *
 * The whole address is always preserved in address_line. City, province, and
 * postal code are only filled in when they can be read with confidence. When a
 * value is uncertain the field is left null and a warning is reported so staff
 * can correct the record by hand. Nothing is ever invented.
 *
 * Used by the Students module and by the one-time workbook migration script.
 */

const POSTAL_CODE =
  /\b([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])[ -]?(\d[ABCEGHJ-NPRSTV-Z]\d)\b/gi;

/** Canonical province name for each spelling the workbook uses. */
const PROVINCE_ALIASES: Record<string, string> = {
  ab: "Alberta",
  alberta: "Alberta",
  bc: "British Columbia",
  "british columbia": "British Columbia",
  mb: "Manitoba",
  manitoba: "Manitoba",
  nb: "New Brunswick",
  "new brunswick": "New Brunswick",
  nl: "Newfoundland and Labrador",
  "newfoundland and labrador": "Newfoundland and Labrador",
  ns: "Nova Scotia",
  "nova scotia": "Nova Scotia",
  nt: "Northwest Territories",
  "northwest territories": "Northwest Territories",
  nu: "Nunavut",
  nunavut: "Nunavut",
  on: "Ontario",
  ont: "Ontario",
  ontario: "Ontario",
  pe: "Prince Edward Island",
  pei: "Prince Edward Island",
  "prince edward island": "Prince Edward Island",
  qc: "Quebec",
  quebec: "Quebec",
  sk: "Saskatchewan",
  saskatchewan: "Saskatchewan",
  yt: "Yukon",
  yukon: "Yukon",
};

export type ParsedAddress = {
  /** The complete original value, whitespace tidied only. */
  addressLine: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  /** Plain language reasons a field was left empty. */
  warnings: string[];
};

function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function provinceFor(segment: string): string | null {
  const key = tidy(segment).replace(/[.]/g, "").toLowerCase();
  return PROVINCE_ALIASES[key] ?? null;
}

export function parseAddress(raw: string | null | undefined): ParsedAddress {
  const addressLine = raw ? tidy(String(raw)) : "";

  if (!addressLine) {
    return {
      addressLine: null,
      city: null,
      province: null,
      postalCode: null,
      warnings: [],
    };
  }

  const warnings: string[] = [];

  const matches = [...addressLine.matchAll(POSTAL_CODE)];
  let postalCode: string | null = null;
  if (matches.length === 1) {
    postalCode = `${matches[0][1]} ${matches[0][2]}`.toUpperCase();
  } else if (matches.length > 1) {
    warnings.push("More than one postal code found, postal code left empty.");
  }

  const withoutPostal = tidy(addressLine.replace(POSTAL_CODE, " "));
  const segments = withoutPostal
    .split(",")
    .map(tidy)
    .filter((segment) => segment.length > 0);

  // The province is read from the end of the address. It is matched either as a
  // whole comma segment ("Toronto, ON") or as the last word of one
  // ("Toronto ON"). Nothing else is treated as a province.
  let provinceIndex = -1;
  let province: string | null = null;
  let cityFromProvinceSegment: string | null = null;

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];

    const whole = provinceFor(segment);
    if (whole) {
      province = whole;
      provinceIndex = index;
      break;
    }

    const words = segment.split(" ");
    if (words.length > 1) {
      const tail = provinceFor(words[words.length - 1]);
      if (tail) {
        province = tail;
        provinceIndex = index;

        // Words before the province are only a city when an earlier segment
        // already holds the street. In a single segment address they are part
        // of the street, so nothing is assumed.
        const lead = tidy(words.slice(0, -1).join(" "));
        if (index > 0 && lead.length >= 2 && !/\d/.test(lead)) {
          cityFromProvinceSegment = lead;
        }
        break;
      }
    }
  }

  if (!province) {
    warnings.push("Province could not be read from the address.");
    return { addressLine, city: null, province: null, postalCode, warnings };
  }

  // Otherwise the city is only trusted when it sits between the street and the
  // province as its own segment.
  let city: string | null = cityFromProvinceSegment;
  if (!city && provinceIndex >= 2) {
    const candidate = segments[provinceIndex - 1];
    if (candidate.length >= 2 && !/\d/.test(candidate)) {
      city = candidate;
    }
  }

  if (!city) {
    warnings.push("City could not be read from the address.");
  }

  return { addressLine, city, province, postalCode, warnings };
}

/**
 * What to show in a student list when city was never parsed. Falls back to the
 * stored address without claiming it is a city.
 */
export function locationLabel(student: {
  city: string | null;
  province: string | null;
  address_line: string | null;
}): string {
  if (student.city) {
    return student.province ? `${student.city}, ${student.province}` : student.city;
  }
  if (student.address_line) return student.address_line;
  if (student.province) return student.province;
  return "No address on file";
}
