import { z } from "zod";

import { PLACEMENT_DOCUMENT_STATUSES } from "@/lib/placement/constants";

/** Trims a form value and turns an empty string into null. */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable()
  .default(null);

/** One short internal line per document. Not a discussion thread. */
export const DOCUMENT_NOTE_MAX_LENGTH = 300;

export const DocumentStatusChangeSchema = z.object({
  document_id: z.uuid(),
  status: z.enum(PLACEMENT_DOCUMENT_STATUSES),
});

export const DocumentNoteSchema = z.object({
  document_id: z.uuid(),
  note: z
    .string()
    .trim()
    .max(
      DOCUMENT_NOTE_MAX_LENGTH,
      `Keep the note under ${DOCUMENT_NOTE_MAX_LENGTH} characters.`,
    )
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .default(null),
});

export const RequirementFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Document name is required.")
    .max(160, "That name is too long."),
  short_name: optionalText.refine(
    (value) => value === null || value.length <= 40,
    { message: "Keep the short name under 40 characters." },
  ),
  description: optionalText.refine(
    (value) => value === null || value.length <= 400,
    { message: "Keep the description under 400 characters." },
  ),
  is_required: z.boolean().default(true),
  sort_order: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? Number(value) : 0))
    .refine((value) => Number.isInteger(value), {
      message: "Order must be a whole number.",
    }),
});

export type RequirementFormValues = z.infer<typeof RequirementFormSchema>;

export function requirementFormDataToObject(formData: FormData) {
  return {
    name: formData.get("name") ?? "",
    short_name: formData.get("short_name") ?? "",
    description: formData.get("description") ?? "",
    is_required: formData.get("is_required") === "on",
    sort_order: formData.get("sort_order") ?? "",
  };
}
