import { z } from "zod";

import {
  AREA_COLOR_KEYS,
  AVAILABILITY_STATUSES,
  DEFAULT_AREA_COLOR_KEY,
  DEFAULT_AVAILABILITY_STATUS,
  DEFAULT_RELATIONSHIP_STATUS,
  RELATIONSHIP_STATUSES,
} from "@/lib/placement/constants";

/** Trims a form value and turns an empty string into null. */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable()
  .default(null);

const optionalEmail = optionalText.refine(
  (value) => value === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  { message: "Enter a valid email address or leave it empty." },
);

/**
 * An area choice from the form. Empty string is Unassigned, which is
 * area_id = null rather than a placement_areas row.
 */
const optionalAreaId = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable()
  .default(null)
  .refine((value) => value === null || z.uuid().safeParse(value).success, {
    message: "Choose an area from the list.",
  });

/** A date only input, stored as a timestamptz at the start of that day. */
const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable()
  .default(null)
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: "Enter a date, or leave it empty.",
  })
  .transform((value) => (value === null ? null : `${value}T00:00:00.000Z`));

/**
 * A date only input stored in a real DATE column, kept as "YYYY-MM-DD".
 *
 * next_intake_date is a day, not a moment, so unlike the follow-up timestamps
 * it is never widened into a timestamptz.
 */
const optionalDateOnly = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable()
  .default(null)
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: "Enter a date, or leave it empty.",
  });

/** The three stored availability fields. Only the status is ever required. */
const availabilityFields = {
  availability_status: z
    .enum(AVAILABILITY_STATUSES)
    .default(DEFAULT_AVAILABILITY_STATUS),
  next_intake_date: optionalDateOnly,
  availability_note: optionalText,
};

export const PartnerFormSchema = z.object({
  name: z.string().trim().min(1, "Partner name is required.").max(200),
  partner_type: optionalText,
  main_phone: optionalText,
  website: optionalText,
  // Location is never required. Imported partners arrive with none of it.
  address_line: optionalText,
  city: optionalText,
  province: optionalText,
  postal_code: optionalText,
  area_id: optionalAreaId,
  relationship_status: z
    .enum(RELATIONSHIP_STATUSES)
    .default(DEFAULT_RELATIONSHIP_STATUS),
  last_contacted_at: optionalDate,
  next_follow_up_at: optionalDate,
  ...availabilityFields,
  /**
   * Checking this stamps availability_checked_at = now(). It is a deliberate
   * staff statement that the availability above was verified, so it is never
   * set automatically by an unrelated edit.
   */
  availability_checked: z.boolean().default(false),
});

export type PartnerFormValues = z.infer<typeof PartnerFormSchema>;

export const ContactFormSchema = z.object({
  partner_id: z.uuid(),
  full_name: z.string().trim().min(1, "Contact name is required.").max(200),
  email: optionalEmail,
  phone: optionalText,
  job_title: optionalText,
  is_primary: z.boolean().default(false),
});

/** The Placement Availability panel on the partner detail page. */
export const AvailabilityFormSchema = z.object({
  partner_id: z.uuid(),
  ...availabilityFields,
  availability_checked: z.boolean().default(false),
});

export const FollowUpFormSchema = z.object({
  partner_id: z.uuid(),
  last_contacted_at: optionalDate,
  next_follow_up_at: optionalDate,
});

export const PartnerNoteFormSchema = z.object({
  partner_id: z.uuid(),
  body: z
    .string()
    .trim()
    .min(1, "Write a comment before posting.")
    .max(4000, "Comments are limited to 4000 characters."),
});

export const AreaFormSchema = z.object({
  name: z.string().trim().min(1, "Area name is required.").max(120),
  description: optionalText,
  sort_order: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? Number(value) : 0))
    .default(0)
    .refine((value) => Number.isInteger(value), {
      message: "Display order must be a whole number.",
    }),
  // A controlled palette key, never an arbitrary hex colour.
  color_key: z.enum(AREA_COLOR_KEYS).default(DEFAULT_AREA_COLOR_KEY),
});

export type AreaFormValues = z.infer<typeof AreaFormSchema>;

/** Reads the shared Add Partner / Edit Partner fields out of a FormData. */
export function partnerFormDataToObject(formData: FormData) {
  return {
    name: formData.get("name") ?? "",
    partner_type: formData.get("partner_type") ?? "",
    main_phone: formData.get("main_phone") ?? "",
    website: formData.get("website") ?? "",
    address_line: formData.get("address_line") ?? "",
    city: formData.get("city") ?? "",
    province: formData.get("province") ?? "",
    postal_code: formData.get("postal_code") ?? "",
    area_id: formData.get("area_id") ?? "",
    relationship_status:
      formData.get("relationship_status") ?? DEFAULT_RELATIONSHIP_STATUS,
    last_contacted_at: formData.get("last_contacted_at") ?? "",
    next_follow_up_at: formData.get("next_follow_up_at") ?? "",
    ...availabilityFormDataToObject(formData),
  };
}

/** The availability fields, shared by the partner form and the detail panel. */
export function availabilityFormDataToObject(formData: FormData) {
  return {
    availability_status:
      formData.get("availability_status") ?? DEFAULT_AVAILABILITY_STATUS,
    next_intake_date: formData.get("next_intake_date") ?? "",
    availability_note: formData.get("availability_note") ?? "",
    availability_checked: formData.get("availability_checked") === "on",
  };
}

export function contactFormDataToObject(formData: FormData) {
  return {
    partner_id: formData.get("partner_id") ?? "",
    full_name: formData.get("full_name") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    job_title: formData.get("job_title") ?? "",
    is_primary: formData.get("is_primary") === "on",
  };
}

export function areaFormDataToObject(formData: FormData) {
  return {
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    sort_order: formData.get("sort_order") ?? "",
    color_key: formData.get("color_key") ?? DEFAULT_AREA_COLOR_KEY,
  };
}

/** A stored timestamptz shown in a date input. */
export function dateInputValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}
