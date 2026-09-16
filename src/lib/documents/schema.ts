import { z } from "zod";

import { PLACEMENT_DOCUMENT_STATUSES } from "@/lib/placement/constants";

/** Trims a form value and turns an empty string into null. */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable()
  .default(null);

/**
 * One short internal line per document. Not a discussion thread.
 *
 * Enforced HERE only. `student_placement_documents.note` is plain `text` in the
 * database with no length constraint, so this is a form rule rather than a
 * storage rule, and it has always been that way.
 */
export const DOCUMENT_NOTE_MAX_LENGTH = 300;

/**
 * One short student-facing line per document.
 *
 * Longer than the internal note, and the two numbers are NOT kept in step: they
 * bound different things for different reasons. The internal note is a jotting
 * for a colleague. This is an instruction to a student, and an instruction that
 * explains itself ("The certificate you sent expired in June, please complete
 * the mask fit again") is worth more than a terse one.
 *
 * Still bounded, because a box that invites three paragraphs invites the
 * private staff comment that belongs in the internal note instead.
 *
 * Unlike the note limit, this one is ALSO a database CHECK constraint in
 * supabase/migrations/0008_student_document_email.sql. This is the field whose
 * contents leave the building, so its bound is a storage fact rather than a
 * form convenience. Change one and change the other.
 */
export const DOCUMENT_STUDENT_MESSAGE_MAX_LENGTH = 500;

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

/**
 * The STUDENT FACING message. A different field from the internal note, saved
 * by a different action, and the only free text a student ever reads.
 */
export const DocumentStudentMessageSchema = z.object({
  document_id: z.uuid(),
  student_message: z
    .string()
    .trim()
    .max(
      DOCUMENT_STUDENT_MESSAGE_MAX_LENGTH,
      `Keep the student message under ${DOCUMENT_STUDENT_MESSAGE_MAX_LENGTH} characters.`,
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
